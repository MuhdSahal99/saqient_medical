import superjson from "superjson";
import { db } from "../../helpers/db";
import { withAuth } from "../../helpers/withAuth";
import { claimScoring } from "../../helpers/claimScoring";
import { schema, type OutputType } from "./update_line_POST.schema";

export const handle = withAuth(async (request, user) => {
  const { lineId, action } = schema.parse(superjson.parse(await request.text()));
  const line = await db
    .selectFrom("claimLines")
    .innerJoin("encounters", "encounters.id", "claimLines.encounterId")
    .select(["claimLines.id", "claimLines.encounterId", "claimLines.kind", "claimLines.code", "claimLines.status", "encounters.status as encounterStatus"])
    .where("claimLines.id", "=", lineId)
    .executeTakeFirst();
  if (!line) throw Object.assign(new Error("Code line not found."), { status: 404 });
  if (line.encounterStatus === "approved") throw Object.assign(new Error("This claim is approved and locked."), { status: 409 });

  await db.transaction().execute(async (trx) => {
    if (action === "accept") await trx.updateTable("claimLines").set({ status: "accepted" }).where("id", "=", lineId).execute();
    if (action === "reject")
      await trx.updateTable("claimLines").set({ status: "rejected", isPrimary: false }).where("id", "=", lineId).execute();
    if (action === "reset") await trx.updateTable("claimLines").set({ status: "proposed" }).where("id", "=", lineId).execute();
    if (action === "make_primary") {
      if (line.kind !== "diagnosis") throw new Error("Only a diagnosis can be primary.");
      await trx.updateTable("claimLines").set({ isPrimary: false }).where("encounterId", "=", line.encounterId).execute();
      await trx.updateTable("claimLines").set({ isPrimary: true, status: "accepted" }).where("id", "=", lineId).execute();
    }
    await trx
      .insertInto("auditLog")
      .values({ encounterId: line.encounterId, userId: user.id, action: `line.${action}`, detail: { code: line.code } as never })
      .execute();
  });

  const scored = await claimScoring(line.encounterId);
  return { ok: true, riskScore: scored.riskScore, readinessScore: scored.readinessScore, status: scored.status } satisfies OutputType;
});