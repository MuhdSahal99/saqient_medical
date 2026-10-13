import type { CodeInfo, RuleHit, ScoredLine } from "./rulesEngine";
import { codeKey } from "./rulesEngine";

export type RiskReason = { label: string; impact: number };

// v0 denial-risk model: a transparent logistic score built from the payer's
// base denial rate, rule hits and code-level denial weights. It is designed to
// be swapped for a trained model (gradient-boosted trees on remittance data)
// behind the same function signature.
const WEIGHTS = { block: 2.2, warn: 0.7, info: 0.15 } as const;

export function riskModel(ctx: {
  baseDenialRate: number;
  hits: RuleHit[];
  lines: ScoredLine[];
  codeIndex: Map<string, CodeInfo>;
}) {
  const base = Math.min(Math.max(ctx.baseDenialRate, 0.01), 0.9);
  let logit = Math.log(base / (1 - base));
  const reasons: RiskReason[] = [{ label: `Payer base denial rate ${(base * 100).toFixed(0)}%`, impact: 0 }];

  for (const h of ctx.hits) {
    const w = WEIGHTS[h.severity];
    logit += w;
    reasons.push({ label: h.message, impact: w });
  }
  for (const l of ctx.lines.filter((x) => x.status !== "rejected")) {
    const info = ctx.codeIndex.get(codeKey(l.system, l.code));
    if (info && info.denialWeight >= 0.15) {
      const w = info.denialWeight * 1.5;
      logit += w;
      reasons.push({ label: `${l.code} has a high historical denial rate`, impact: w });
    }
  }

  const p = 1 / (1 + Math.exp(-logit));
  const blocks = ctx.hits.filter((h) => h.severity === "block").length;
  const warns = ctx.hits.filter((h) => h.severity === "warn").length;
  const infos = ctx.hits.filter((h) => h.severity === "info").length;
  const readiness = Math.max(0, Math.min(100, 100 - blocks * 30 - warns * 10 - infos * 3));

  const top = reasons
    .filter((r) => r.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5)
    .map((r) => ({ ...r, impact: Math.round(r.impact * 100) / 100 }));

  return { riskScore: Math.round(p * 100), readinessScore: readiness, reasons: top };
}