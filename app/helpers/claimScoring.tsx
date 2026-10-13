import { db } from "./db";
import { codeKey, rulesEngine, type CodeInfo, type PreauthState, type ScoredLine } from "./rulesEngine";
import { riskModel } from "./riskModel";
import type { Market } from "./schema";

export async function loadCodeIndex(market: Market) {
  const systems = market === "KSA" ? (["ICD10AM", "ACHI"] as const) : (["ICD10CM", "CPT"] as const);
  const rows = await db
    .selectFrom("codeSets")
    .select(["system", "code", "description", "requiresPreauth", "denialWeight"])
    .where("system", "in", [...systems])
    .execute();
  const index = new Map<string, CodeInfo>();
  for (const r of rows) index.set(codeKey(r.system, r.code), r);
  return index;
}

// Re-runs the deterministic rules and the risk model for one encounter and
// stores the result. Called by the agent pipeline and after every coder edit,
// so scores always reflect the current claim lines.
export async function claimScoring(encounterId: number) {
  const enc = await db
    .selectFrom("encounters")
    .innerJoin("payers", "payers.id", "encounters.payerId")
    .select([
      "encounters.id",
      "encounters.market",
      "encounters.encounterDate",
      "encounters.noteText",
      "encounters.preauth",
      "encounters.status",
      "payers.baseDenialRate",
    ])
    .where("encounters.id", "=", encounterId)
    .executeTakeFirstOrThrow();

  const [lineRows, rules, codeIndex] = await Promise.all([
    db.selectFrom("claimLines").selectAll().where("encounterId", "=", encounterId).execute(),
    db.selectFrom("payerRules").selectAll().execute(),
    loadCodeIndex(enc.market),
  ]);

  const lines: ScoredLine[] = lineRows.map((l) => ({
    kind: l.kind,
    system: l.system,
    code: l.code,
    description: l.description,
    source: l.source,
    status: l.status,
    isPrimary: l.isPrimary,
    verifierScore: l.verifierScore,
  }));

  const hits = rulesEngine({
    market: enc.market,
    encounterDate: enc.encounterDate,
    noteText: enc.noteText,
    lines,
    codeIndex,
    preauth: (enc.preauth as PreauthState | null) ?? null,
    rules,
  });
  const risk = riskModel({ baseDenialRate: enc.baseDenialRate, hits, lines, codeIndex });

  const hasBlocks = hits.some((h) => h.severity === "block");
  const pendingAi = lineRows.some((l) => l.source === "ai_suggested" && l.status === "proposed");
  const status = enc.status === "approved" ? "approved" : hasBlocks || pendingAi ? "needs_review" : "ready";

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("ruleHits").where("encounterId", "=", encounterId).execute();
    if (hits.length) {
      await trx.insertInto("ruleHits").values(hits.map((h) => ({ ...h, encounterId }))).execute();
    }
    await trx
      .updateTable("encounters")
      .set({
        riskScore: risk.riskScore,
        readinessScore: risk.readinessScore,
        riskReasons: risk.reasons as never,
        status,
        updatedAt: new Date(),
      })
      .where("id", "=", encounterId)
      .execute();
  });

  return { hits, ...risk, status };
}