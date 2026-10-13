import { db } from "./db";
import { aiClient } from "./aiClient";
import { phiRedaction } from "./phiRedaction";
import { claimScoring, loadCodeIndex } from "./claimScoring";
import { codeKey, type CodeInfo, type PreauthState } from "./rulesEngine";
import type { AgentName, AgentStatus, FactType, Market } from "./schema";

// Supervised multi-agent pipeline. Each agent has one narrow job, a strict
// output schema and a guardrail that checks its output against the source
// note or the code tables. The deterministic rules engine and risk model run
// last and have the final say; a human coder approves the claim.
//
//   1 redaction (deterministic)  -> 2 extraction (LLM)  -> 3 coding (LLM, retrieval-restricted)
//   -> 4 verifier (judge model)   -> 5 pre-auth (judge model) -> 6 rules + 7 risk (deterministic)

const NOTE_LIMIT = 6000; // characters sent to generative agents (token budget)
const MAX_DX_CANDIDATES = 20;
const MAX_PX_CANDIDATES = 12;

const FACT_TYPES: FactType[] = ["diagnosis", "procedure", "medication", "lab", "finding", "history"];

type Fact = { type: FactType; text: string; evidence: string; negated: boolean };
type CodeSuggestion = {
  code: string;
  isPrimary: boolean;
  evidence: string;
  rationale: string;
  confidence: number;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const compact = (s: string) => s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
const STOP = new Set(["the", "and", "with", "for", "without", "other", "unspecified", "patient", "region", "each", "visit"]);
const tokens = (s: string) =>
  new Set(
    norm(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOP.has(t))
  );

function evidenceIsInNote(evidence: string, note: string) {
  const e = norm(evidence);
  return e.length >= 4 && norm(note).includes(e);
}

async function logRun(
  encounterId: number,
  agent: AgentName,
  r: { status: AgentStatus; model?: string; durationMs?: number; credits?: number; inputChars?: number; summary: string }
) {
  await db
    .insertInto("agentRuns")
    .values({
      encounterId,
      agent,
      status: r.status,
      model: r.model ?? "deterministic",
      durationMs: Math.round(r.durationMs ?? 0),
      credits: r.credits ?? 0,
      inputChars: r.inputChars ?? 0,
      summary: r.summary,
    })
    .execute();
}

// Token optimization: send the coding agent only the codes that lexically
// match the extracted facts instead of the whole code set.
function retrieveCandidates(facts: Fact[], codeIndex: Map<string, CodeInfo>) {
  const factTokens = tokens(facts.filter((f) => !f.negated).map((f) => `${f.text} ${f.evidence}`).join(" "));
  const scored = Array.from(codeIndex.values()).map((c) => {
    const words = tokens(`${c.description}`);
    const kw = tokens((c as CodeInfo & { keywords?: string }).keywords ?? "");
    let score = 0;
    for (const w of words) if (factTokens.has(w)) score += 1;
    for (const w of kw) if (factTokens.has(w)) score += 1.5;
    return { c, score };
  });
  const isDx = (c: CodeInfo) => c.system === "ICD10CM" || c.system === "ICD10AM";
  const top = (dx: boolean, n: number) =>
    scored
      .filter((s) => s.score > 0 && isDx(s.c) === dx)
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((s) => s.c);
  return { dx: top(true, MAX_DX_CANDIDATES), px: top(false, MAX_PX_CANDIDATES) };
}

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["facts"],
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "text", "evidence", "negated"],
        properties: {
          type: { type: "string", enum: FACT_TYPES },
          text: { type: "string" },
          evidence: { type: "string" },
          negated: { type: "boolean" },
        },
      },
    },
  },
};

const CODING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["codes"],
  properties: {
    codes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "isPrimary", "evidence", "rationale", "confidence"],
        properties: {
          code: { type: "string" },
          isPrimary: { type: "boolean" },
          evidence: { type: "string" },
          rationale: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
  },
};

const EXTRACTION_INSTRUCTIONS = `You are a clinical documentation extraction agent for medical billing.
Extract the clinically relevant facts from the de-identified note.
Rules:
- Only extract what the note states. Never infer, guess or add facts.
- "evidence" must be an exact, verbatim quote from the note (5 to 25 words) that states the fact.
- Set "negated" to true when the note rules the fact out (e.g. "no fracture", "denies fever").
- "text" is a short normalized clinical phrase (e.g. "lumbar radiculopathy, left").
- Ignore placeholders in square brackets such as [NAME].
- At most 20 facts. Prefer diagnoses, procedures performed or ordered, and findings that justify them.`;

const CODING_INSTRUCTIONS = `You are a certified medical coding agent for GCC payers.
Choose codes ONLY from the candidate lists provided. Never invent a code.
Rules:
- Code only conditions and services the note documents; do not code ruled-out (negated) conditions.
- Prefer the most specific candidate the note supports; avoid "unspecified" when the note is specific.
- Mark exactly one diagnosis as primary (the main reason for the encounter). Procedures are never primary.
- "evidence" must be an exact verbatim quote from the note that supports the code.
- "rationale" is one short sentence. "confidence" is 0 to 1.
- If the documentation is insufficient for any code, return fewer codes rather than guessing.
- Include codes already on the claim when the note supports them, so their evidence is recorded. Leave out unsupported ones.`;

export async function agentPipeline(encounterId: number) {
  const enc = await db
    .selectFrom("encounters")
    .innerJoin("payers", "payers.id", "encounters.payerId")
    .select([
      "encounters.id",
      "encounters.market",
      "encounters.noteText",
      "encounters.encounterType",
      "encounters.specialty",
      "payers.platform",
    ])
    .where("encounters.id", "=", encounterId)
    .executeTakeFirstOrThrow();
  const market = enc.market as Market;
  let credits = 0;

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("agentRuns").where("encounterId", "=", encounterId).execute();
    await trx.deleteFrom("extractedFacts").where("encounterId", "=", encounterId).execute();
    await trx.deleteFrom("claimLines").where("encounterId", "=", encounterId).where("source", "=", "ai_suggested").execute();
    await trx
      .updateTable("encounters")
      .set({ status: "processing", pipelineError: null, preauth: null, updatedAt: new Date() })
      .where("id", "=", encounterId)
      .execute();
  });

  try {
    // 1. Redaction guard: the note was redacted at ingest; re-check before any model sees it.
    const t1 = Date.now();
    const red = phiRedaction(enc.noteText);
    let note = red.text;
    if (red.count > 0) {
      await db.updateTable("encounters").set({ noteText: note }).where("id", "=", encounterId).execute();
    }
    await logRun(encounterId, "redaction", {
      status: "ok",
      durationMs: Date.now() - t1,
      inputChars: enc.noteText.length,
      summary: red.count ? `Removed ${red.count} more identifiers before AI processing.` : "No identifiers found; note is safe to process.",
    });
    note = compact(note);
    const noteForModel = note.slice(0, NOTE_LIMIT);

    // 2. Extraction agent
    const ex = await aiClient.structured<{ facts: Fact[] }>({
      agent: "extraction",
      instructions: EXTRACTION_INSTRUCTIONS,
      input: `ENCOUNTER: ${enc.encounterType}, ${enc.specialty}\nNOTE:\n${noteForModel}`,
      schemaName: "clinical_facts",
      schema: EXTRACTION_SCHEMA,
      maxOutputTokens: 2500,
    });
    credits += ex.credits;
    const facts = ex.data.facts.filter((f) => FACT_TYPES.includes(f.type) && evidenceIsInNote(f.evidence, note));
    const droppedFacts = ex.data.facts.length - facts.length;
    if (facts.length) {
      await db
        .insertInto("extractedFacts")
        .values(facts.map((f) => ({ encounterId, factType: f.type, text: f.text, evidence: f.evidence, negated: f.negated })))
        .execute();
    }
    await logRun(encounterId, "extraction", {
      status: ex.cached ? "cached" : "ok",
      model: ex.model,
      durationMs: ex.durationMs,
      credits: ex.credits,
      inputChars: ex.inputChars,
      summary: `Found ${facts.length} facts with evidence${droppedFacts ? `; discarded ${droppedFacts} without a verbatim quote` : ""}.`,
    });

    // 3. Coding agent (retrieval-restricted)
    const codeIndexFull = await db
      .selectFrom("codeSets")
      .select(["system", "code", "description", "requiresPreauth", "denialWeight", "keywords"])
      .where("system", "in", market === "KSA" ? ["ICD10AM", "ACHI"] : ["ICD10CM", "CPT"])
      .execute();
    const codeIndex = new Map<string, CodeInfo & { keywords: string }>();
    for (const c of codeIndexFull) codeIndex.set(codeKey(c.system, c.code), c);
    const cands = retrieveCandidates(facts, codeIndex);
    const existing = await db.selectFrom("claimLines").selectAll().where("encounterId", "=", encounterId).execute();
    // Codes the provider already entered are always offered, so the agent can attach evidence to them.
    for (const l of existing) {
      const info = codeIndex.get(codeKey(l.system, l.code));
      if (!info) continue;
      const isDxCode = info.system === "ICD10CM" || info.system === "ICD10AM";
      const list = isDxCode ? cands.dx : cands.px;
      if (!list.some((c) => c.code === info.code)) list.push(info);
    }
    const candidateByCode = new Map<string, CodeInfo>();
    for (const c of [...cands.dx, ...cands.px]) candidateByCode.set(c.code.toUpperCase(), c);

    let added = 0;
    let rejectedByGuard = 0;
    if (candidateByCode.size === 0) {
      await logRun(encounterId, "coding", { status: "skipped", summary: "No candidate codes matched the extracted facts." });
    } else {
      const factLines = facts.map((f) => `- [${f.type}${f.negated ? ", NEGATED" : ""}] ${f.text}`).join("\n");
      const list = (cs: CodeInfo[]) => cs.map((c) => `${c.code} | ${c.description}`).join("\n") || "(none)";
      const co = await aiClient.structured<{ codes: CodeSuggestion[] }>({
        agent: "coding",
        instructions: CODING_INSTRUCTIONS,
        input: `MARKET: ${market} (${market === "KSA" ? "ICD-10-AM + ACHI" : "ICD-10-CM + CPT"})\nENCOUNTER: ${enc.encounterType}, ${enc.specialty}\nCODES ALREADY ON THE CLAIM: ${existing.map((l) => l.code).join(", ") || "none"}\nFACTS:\n${factLines}\nNOTE:\n${noteForModel}\nCANDIDATE DIAGNOSIS CODES:\n${list(cands.dx)}\nCANDIDATE PROCEDURE CODES:\n${list(cands.px)}`,
        schemaName: "code_suggestions",
        schema: CODING_SCHEMA,
        maxOutputTokens: 2000,
      });
      credits += co.credits;

      const hasSubmittedPrimary = existing.some((l) => l.kind === "diagnosis" && l.isPrimary);
      let primaryTaken = hasSubmittedPrimary;
      const seen = new Set<string>();
      for (const s of co.data.codes) {
        const info = candidateByCode.get(s.code.toUpperCase().trim());
        // Guardrails: code must be a retrieved candidate and the quote must be in the note.
        if (!info || !evidenceIsInNote(s.evidence, note) || seen.has(info.code)) {
          rejectedByGuard += 1;
          continue;
        }
        seen.add(info.code);
        const kind = info.system === "ICD10CM" || info.system === "ICD10AM" ? "diagnosis" : "procedure";
        const confidence = Math.max(0, Math.min(1, s.confidence));
        const match = existing.find((l) => l.code.toUpperCase() === info.code.toUpperCase() && l.system === info.system);
        if (match) {
          await db
            .updateTable("claimLines")
            .set({ evidence: s.evidence, rationale: s.rationale, confidence })
            .where("id", "=", match.id)
            .execute();
          continue;
        }
        const isPrimary = kind === "diagnosis" && s.isPrimary && !primaryTaken;
        if (isPrimary) primaryTaken = true;
        await db
          .insertInto("claimLines")
          .values({
            encounterId,
            kind,
            system: info.system,
            code: info.code,
            description: info.description,
            source: "ai_suggested",
            status: "proposed",
            isPrimary,
            confidence,
            evidence: s.evidence,
            rationale: s.rationale,
          })
          .execute();
        added += 1;
      }
      await logRun(encounterId, "coding", {
        status: co.cached ? "cached" : "ok",
        model: co.model,
        durationMs: co.durationMs,
        credits: co.credits,
        inputChars: co.inputChars,
        summary: `Reviewed ${candidateByCode.size} candidate codes; suggested ${added} new code${added === 1 ? "" : "s"}${rejectedByGuard ? `; blocked ${rejectedByGuard} that failed the code-table or evidence check` : ""}.`,
      });
    }

    // 4. Verifier agent: independent judge re-checks each AI suggestion.
    const aiLines = await db
      .selectFrom("claimLines")
      .selectAll()
      .where("encounterId", "=", encounterId)
      .where("source", "=", "ai_suggested")
      .execute();
    if (aiLines.length === 0) {
      await logRun(encounterId, "verifier", { status: "skipped", summary: "No AI suggestions to verify." });
    } else {
      const questions: Record<string, { type: "noul"; instructions: string; criteria: { true: string; false: string } }> = {};
      for (const l of aiLines) {
        questions[`l${l.id}`] = {
          type: "noul",
          instructions: `Does \`note\` directly document the condition or service for code ${l.code} ("${l.description}")?`,
          criteria: {
            true: "The note explicitly states this condition or service for this patient",
            false: "Not stated, only possible, ruled out, or a different condition or service",
          },
        };
      }
      const ver = await aiClient.judge({ agent: "verifier", state: { note: note.slice(0, 12000) }, questions });
      credits += ver.credits;
      let weak = 0;
      for (const l of aiLines) {
        const score = ver.data[`l${l.id}`] ?? null;
        if (score !== null && score < 0.5) weak += 1;
        await db.updateTable("claimLines").set({ verifierScore: score }).where("id", "=", l.id).execute();
      }
      await logRun(encounterId, "verifier", {
        status: ver.cached ? "cached" : "ok",
        model: ver.model,
        durationMs: ver.durationMs,
        credits: ver.credits,
        inputChars: ver.inputChars,
        summary: weak ? `Flagged ${weak} of ${aiLines.length} suggestions as weakly supported.` : `All ${aiLines.length} suggestions are supported by the note.`,
      });
    }

    // 5. Pre-authorization agent
    const allLines = await db.selectFrom("claimLines").selectAll().where("encounterId", "=", encounterId).execute();
    const scoringIndex = await loadCodeIndex(market);
    const paLines = allLines.filter(
      (l) => l.kind === "procedure" && l.status !== "rejected" && scoringIndex.get(codeKey(l.system, l.code))?.requiresPreauth
    );
    let preauth: PreauthState = { required: false, items: [] };
    if (paLines.length === 0) {
      await logRun(encounterId, "preauth", { status: "skipped", summary: "No procedures on this claim need prior approval." });
    } else {
      const questions: Record<string, { type: "noul"; instructions: string }> = {};
      for (const l of paLines) {
        questions[`nec_${l.id}`] = {
          type: "noul",
          instructions: `Does \`note\` justify ${l.description} by documenting at least one of: failed conservative treatment with its duration, red-flag symptoms, a neurological deficit, or objective exam findings that call for it?`,
        };
        questions[`appr_${l.id}`] = {
          type: "noul",
          instructions: `Does \`note\` state that prior authorization or payer approval for ${l.description} was obtained, with an approval or reference number?`,
        };
      }
      const pa = await aiClient.judge({ agent: "preauth", state: { note: note.slice(0, 12000) }, questions });
      credits += pa.credits;
      const platform = enc.platform;
      preauth = {
        required: true,
        items: paLines.map((l) => ({
          code: l.code,
          description: l.description,
          necessityScore: pa.data[`nec_${l.id}`] ?? null,
          approvalMentioned: pa.data[`appr_${l.id}`] ?? null,
          checklist: [
            `Send the prior-approval request through ${platform}${market === "DHA" ? " within 1 hour of the order" : ""}`,
            "Attach the clinical note with history and exam findings",
            "Attach previous imaging or test reports",
            "Document conservative treatment tried and for how long",
          ],
        })),
      };
      const unmet = preauth.items.filter((i) => (i.necessityScore ?? 0) < 0.5).length;
      await logRun(encounterId, "preauth", {
        status: pa.cached ? "cached" : "ok",
        model: pa.model,
        durationMs: pa.durationMs,
        credits: pa.credits,
        inputChars: pa.inputChars,
        summary: `${paLines.length} procedure${paLines.length === 1 ? " needs" : "s need"} prior approval; ${unmet ? `${unmet} lack documented necessity` : "necessity is documented"}.`,
      });
    }
    await db.updateTable("encounters").set({ preauth: preauth as never }).where("id", "=", encounterId).execute();

    // 6 + 7. Deterministic rules engine and risk model
    const t6 = Date.now();
    const scored = await claimScoring(encounterId);
    const blocks = scored.hits.filter((h) => h.severity === "block").length;
    const warns = scored.hits.filter((h) => h.severity === "warn").length;
    await logRun(encounterId, "rules", {
      status: "ok",
      durationMs: Date.now() - t6,
      summary: `${scored.hits.length} rule hit${scored.hits.length === 1 ? "" : "s"}: ${blocks} blocking, ${warns} warnings.`,
    });
    await logRun(encounterId, "risk", {
      status: "ok",
      model: "logistic-v0",
      summary: `Denial risk ${scored.riskScore}%, claim readiness ${scored.readinessScore}%.`,
    });

    await db
      .updateTable("encounters")
      .set({ processedAt: new Date(), aiCredits: credits, updatedAt: new Date() })
      .where("id", "=", encounterId)
      .execute();
    return scored;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    await db
      .updateTable("encounters")
      .set({ status: "error", pipelineError: message, aiCredits: credits, updatedAt: new Date() })
      .where("id", "=", encounterId)
      .execute();
    throw err;
  }
}