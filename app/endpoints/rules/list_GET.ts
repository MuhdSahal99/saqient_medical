import { sql } from "kysely";
import { db } from "../../helpers/db";
import { withAuth } from "../../helpers/withAuth";
import type { OutputType } from "./list_GET.schema";

export const handle = withAuth(async () => {
  const rules = await db
    .selectFrom("payerRules")
    .selectAll("payerRules")
    .select((eb) =>
      eb
        .selectFrom("ruleHits")
        .select(sql<number>`count(*)::int`.as("n"))
        .whereRef("ruleHits.ruleKey", "=", "payerRules.ruleKey")
        .as("hitCount")
    )
    .orderBy("severity")
    .orderBy("id")
    .execute();
  return { rules: rules.map((r) => ({ ...r, hitCount: r.hitCount ?? 0 })) } satisfies OutputType;
});