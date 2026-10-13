import { db } from "../../helpers/db";
import { withAuth } from "../../helpers/withAuth";
import { schema, type OutputType } from "./detail_GET.schema";
import type { PreauthState } from "../../helpers/rulesEngine";
import type { RiskReason } from "../../helpers/riskModel";

export const handle = withAuth(async (request) => {
  const { id } = schema.parse({ id: new URL(request.url).searchParams.get("id") });
  const encounter = await db
    .selectFrom("encounters")
    .innerJoin("payers", "payers.id", "encounters.payerId")
    .selectAll("encounters")
    .select(["payers.name as payerName", "payers.platform"])
    .where("encounters.id", "=", id)
    .executeTakeFirst();
  if (!encounter) throw Object.assign(new Error("Claim not found."), { status: 404 });

  const [lines, facts, hits, agentRuns, audit] = await Promise.all([
    db.selectFrom("claimLines").selectAll().where("encounterId", "=", id).orderBy("kind").orderBy("isPrimary", "desc").orderBy("id").execute(),
    db.selectFrom("extractedFacts").selectAll().where("encounterId", "=", id).orderBy("id").execute(),
    db.selectFrom("ruleHits").selectAll().where("encounterId", "=", id).orderBy("id").execute(),
    db.selectFrom("agentRuns").selectAll().where("encounterId", "=", id).orderBy("id").execute(),
    db
      .selectFrom("auditLog")
      .leftJoin("users", "users.id", "auditLog.userId")
      .selectAll("auditLog")
      .select("users.displayName as userName")
      .where("auditLog.encounterId", "=", id)
      .orderBy("auditLog.id", "desc")
      .execute(),
  ]);

  return {
    encounter: {
      ...encounter,
      preauth: (encounter.preauth as PreauthState | null) ?? null,
      riskReasons: (encounter.riskReasons as RiskReason[] | null) ?? [],
    },
    lines,
    facts,
    hits,
    agentRuns,
    audit,
  } satisfies OutputType;
});