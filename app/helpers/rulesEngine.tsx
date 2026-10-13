import type { CodeSystem, LineKind, LineSource, LineStatus, Market, RuleSeverity } from "./schema";

// Deterministic payer rules engine. Rules are data (payer_rules table); this
// file only knows how to evaluate each rule_type. The engine, not the model,
// decides pass or fail.

export type RuleRow = {
  ruleKey: string;
  name: string;
  ruleType: string;
  severity: RuleSeverity;
  params: unknown;
  reference: string;
  market: Market | null;
  active: boolean;
};

export type ScoredLine = {
  kind: LineKind;
  system: CodeSystem;
  code: string;
  description: string;
  source: LineSource;
  status: LineStatus;
  isPrimary: boolean;
  verifierScore: number | null;
};

export type CodeInfo = {
  system: CodeSystem;
  code: string;
  description: string;
  requiresPreauth: boolean;
  denialWeight: number;
};

export type PreauthItem = {
  code: string;
  description: string;
  necessityScore: number | null;
  approvalMentioned: number | null;
  checklist: string[];
};

export type PreauthState = { required: boolean; items: PreauthItem[] };

export type RuleHit = {
  ruleKey: string;
  ruleName: string;
  severity: RuleSeverity;
  message: string;
  fix: string;
  reference: string;
  code: string | null;
};

export const codeKey = (system: string, code: string) => `${system}|${code.toUpperCase()}`;

export function rulesEngine(ctx: {
  market: Market;
  encounterDate: Date;
  noteText: string;
  lines: ScoredLine[];
  codeIndex: Map<string, CodeInfo>;
  preauth: PreauthState | null;
  rules: RuleRow[];
  now?: Date;
}): RuleHit[] {
  const hits: RuleHit[] = [];
  const active = ctx.lines.filter((l) => l.status !== "rejected");
  const dx = active.filter((l) => l.kind === "diagnosis");
  const px = active.filter((l) => l.kind === "procedure");
  const now = ctx.now ?? new Date();

  for (const rule of ctx.rules) {
    if (!rule.active) continue;
    if (rule.market && rule.market !== ctx.market) continue;
    const params = (rule.params ?? {}) as Record<string, unknown>;
    const hit = (message: string, fix: string, code: string | null = null) =>
      hits.push({ ruleKey: rule.ruleKey, ruleName: rule.name, severity: rule.severity, message, fix, reference: rule.reference, code });

    switch (rule.ruleType) {
      case "primary_dx_required": {
        if (dx.length === 0) hit("No diagnosis on the claim.", "Add the diagnosis that explains the visit.");
        else if (!dx.some((l) => l.isPrimary)) hit("No diagnosis is marked as primary.", "Mark the main reason for the visit as primary.");
        else if (dx.filter((l) => l.isPrimary).length > 1) hit("More than one primary diagnosis.", "Keep only one primary diagnosis.");
        break;
      }
      case "code_exists": {
        for (const l of active) {
          if (!ctx.codeIndex.has(codeKey(l.system, l.code)))
            hit(`${l.code} is not in the active ${l.system} code set.`, "Check the code and version, or replace it with a valid code.", l.code);
        }
        break;
      }
      case "market_code_system": {
        const allowed = (params[ctx.market] as string[] | undefined) ?? [];
        for (const l of active) {
          if (allowed.length && !allowed.includes(l.system))
            hit(`${l.code} uses ${l.system}, which ${ctx.market} claims do not accept.`, `Recode with ${allowed.join(" / ")}.`, l.code);
        }
        break;
      }
      case "duplicate_codes": {
        const seen = new Set<string>();
        for (const l of active) {
          const k = codeKey(l.system, l.code);
          if (seen.has(k)) hit(`${l.code} appears more than once.`, "Remove the duplicate line.", l.code);
          seen.add(k);
        }
        break;
      }
      case "preauth_required": {
        for (const l of px) {
          const info = ctx.codeIndex.get(codeKey(l.system, l.code));
          if (!info?.requiresPreauth) continue;
          const item = ctx.preauth?.items.find((i) => i.code === l.code);
          if (!item || (item.approvalMentioned ?? 0) < 0.5)
            hit(`${l.code} (${l.description}) needs prior approval and none is documented.`, "Request approval from the payer and record the approval number before submitting.", l.code);
        }
        break;
      }
      case "medical_necessity": {
        for (const item of ctx.preauth?.items ?? []) {
          if (!active.some((l) => l.code === item.code)) continue;
          if (item.necessityScore !== null && item.necessityScore < 0.5)
            hit(`The note does not clearly justify ${item.code} (${item.description}).`, "Document failed conservative treatment, red-flag symptoms or objective exam findings.", item.code);
        }
        break;
      }
      case "unspecified_dx": {
        for (const l of dx) {
          if (/unspecified/i.test(l.description))
            hit(`${l.code} is an unspecified diagnosis.`, "Use a more specific code if the note documents type, site or laterality.", l.code);
        }
        break;
      }
      case "dx_supports_px": {
        if (px.length > 0 && dx.length === 0)
          hit("Procedures are billed without any supporting diagnosis.", "Add the diagnosis that justifies each procedure.");
        break;
      }
      case "low_evidence_ai": {
        const threshold = Number(params.threshold ?? 0.5);
        for (const l of active) {
          if (l.source === "ai_suggested" && l.verifierScore !== null && l.verifierScore < threshold)
            hit(`The verifier found weak support for AI-suggested ${l.code}.`, "Confirm the evidence in the note before accepting this code.", l.code);
        }
        break;
      }
      case "em_level_documentation": {
        const code = String(params.code ?? "");
        const minChars = Number(params.minChars ?? 500);
        if (active.some((l) => l.code === code) && ctx.noteText.length < minChars)
          hit(`${code} is billed but the note is short for moderate decision making.`, "Document history, exam and decision making, or bill a lower visit level.", code);
        break;
      }
      case "submission_window": {
        const days = Number(params.days ?? 30);
        const ageDays = Math.floor((now.getTime() - new Date(ctx.encounterDate).getTime()) / 86_400_000);
        if (ageDays > days)
          hit(`The encounter is ${ageDays} days old, past the ${days}-day target.`, "Submit now to limit late-submission fees.");
        break;
      }
      case "achi_pack_missing": {
        if (!Array.from(ctx.codeIndex.values()).some((c) => c.system === "ACHI"))
          hit("No licensed ACHI/SBS procedure pack is loaded, so procedures were not auto-coded.", "Load the licensed ACHI/SBS code set, or code procedures manually.");
        break;
      }
      default:
        break;
    }
  }
  return hits;
}