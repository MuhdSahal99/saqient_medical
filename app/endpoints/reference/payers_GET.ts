import { db } from "../../helpers/db";
import { withAuth } from "../../helpers/withAuth";
import type { OutputType } from "./payers_GET.schema";

export const handle = withAuth(async () => {
  const payers = await db
    .selectFrom("payers")
    .select(["id", "code", "name", "market", "platform", "baseDenialRate"])
    .orderBy("market")
    .orderBy("name")
    .execute();
  return { payers } satisfies OutputType;
});