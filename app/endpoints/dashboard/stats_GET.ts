import { sql } from "kysely";
import { db } from "../../helpers/db";
import { withAuth } from "../../helpers/withAuth";
import type { OutputType } from "./stats_GET.schema";

export const handle = withAuth(async () => {
  const [totals, hitTotals, topIssues, buckets, byPayer, ai] = await Promise.all([
    db
      .selectFrom("encounters")
      .select([
        sql<number>`count(*)::int`.as("claims"),
        sql<number>`count(*) filter (where status = 'needs_review')::int`.as("needsReview"),
        sql<number>`count(*) filter (where status = 'ready')::int`.as("ready"),
        sql<number>`count(*) filter (where status = 'approved')::int`.as("approved"),
        sql<number>`count(*) filter (where status = 'error')::int`.as("errors"),
        sql<number | null>`round(avg(risk_score))::int`.as("avgRisk"),
        sql<number>`coalesce(sum(billed_amount), 0)::float`.as("billed"),
        sql<number>`coalesce(sum(billed_amount * coalesce(risk_score, 0) / 100.0) filter (where status <> 'approved'), 0)::float`.as("billedAtRisk"),
      ])
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("ruleHits")
      .select([
        sql<number>`count(*)::int`.as("issuesCaught"),
        sql<number>`count(*) filter (where severity = 'block')::int`.as("blockersCaught"),
      ])
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("ruleHits")
      .select(["ruleName", sql<string>`max(severity::text)`.as("severity"), sql<number>`count(*)::int`.as("count")])
      .groupBy("ruleName")
      .orderBy("count", "desc")
      .limit(6)
      .execute(),
    db
      .selectFrom("encounters")
      .select([
        sql<string>`case when risk_score < 20 then '0-19' when risk_score < 40 then '20-39' when risk_score < 60 then '40-59' when risk_score < 80 then '60-79' else '80-100' end`.as("bucket"),
        sql<number>`count(*)::int`.as("count"),
      ])
      .where("riskScore", "is not", null)
      .groupBy("bucket")
      .execute(),
    db
      .selectFrom("encounters")
      .innerJoin("payers", "payers.id", "encounters.payerId")
      .select(["payers.name as payerName", sql<number>`count(*)::int`.as("claims"), sql<number>`coalesce(round(avg(encounters.risk_score)), 0)::int`.as("avgRisk")])
      .groupBy("payers.name")
      .orderBy("claims", "desc")
      .execute(),
    db
      .selectFrom("agentRuns")
      .select([
        sql<number>`count(*) filter (where model <> 'deterministic' and model <> 'logistic-v0')::int`.as("runs"),
        sql<number>`count(*) filter (where status = 'cached')::int`.as("cachedRuns"),
        sql<number>`coalesce(sum(credits), 0)::float`.as("credits"),
        sql<number>`count(*) filter (where summary like '%blocked%' or summary like '%discarded%')::int`.as("guardrailBlocks"),
      ])
      .executeTakeFirstOrThrow(),
  ]);

  const order = ["0-19", "20-39", "40-59", "60-79", "80-100"];
  const riskBuckets = order.map((b) => ({ bucket: b, count: buckets.find((x) => x.bucket === b)?.count ?? 0 }));

  return { totals: { ...totals, ...hitTotals }, topIssues, riskBuckets, byPayer, ai } satisfies OutputType;
});