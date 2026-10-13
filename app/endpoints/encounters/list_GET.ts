import { sql } from "kysely";
import { db } from "../../helpers/db";
import { withAuth } from "../../helpers/withAuth";
import { schema, type OutputType } from "./list_GET.schema";

export const handle = withAuth(async (request) => {
  const url = new URL(request.url);
  const input = schema.parse({
    status: url.searchParams.get("status") || undefined,
    search: url.searchParams.get("search") || undefined,
  });

  let q = db
    .selectFrom("encounters")
    .innerJoin("payers", "payers.id", "encounters.payerId")
    .select((eb) => [
      "encounters.id",
      "encounters.patientRef",
      "payers.name as payerName",
      "encounters.market",
      "encounters.specialty",
      "encounters.encounterType",
      "encounters.encounterDate",
      "encounters.billedAmount",
      "encounters.status",
      "encounters.riskScore",
      "encounters.readinessScore",
      "encounters.createdAt",
      eb
        .selectFrom("ruleHits")
        .select(sql<number>`count(*)::int`.as("n"))
        .whereRef("ruleHits.encounterId", "=", "encounters.id")
        .where("ruleHits.severity", "=", "block")
        .as("blockers"),
      eb
        .selectFrom("claimLines")
        .select(sql<number>`count(*)::int`.as("n"))
        .whereRef("claimLines.encounterId", "=", "encounters.id")
        .where("claimLines.source", "=", "ai_suggested")
        .where("claimLines.status", "=", "proposed")
        .as("pendingSuggestions"),
    ])
    .orderBy("encounters.createdAt", "desc")
    .limit(200);

  if (input.status) q = q.where("encounters.status", "=", input.status);
  if (input.search) {
    const term = `%${input.search}%`;
    q = q.where((eb) =>
      eb.or([
        eb("encounters.patientRef", "ilike", term),
        eb("encounters.specialty", "ilike", term),
        eb("payers.name", "ilike", term),
      ])
    );
  }
  const rows = await q.execute();
  return {
    claims: rows.map((r) => ({ ...r, blockers: r.blockers ?? 0, pendingSuggestions: r.pendingSuggestions ?? 0 })),
  } satisfies OutputType;
});