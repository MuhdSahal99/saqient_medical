import superjson from "superjson";
import { db } from "../../helpers/db";
import { withAuth } from "../../helpers/withAuth";
import { claimScoring } from "../../helpers/claimScoring";
import { schema, type OutputType } from "./approve_POST.schema";

// Human-in-the-loop gate: nothing is "ready to submit" until a person approves
// it, and approval is refused while blockers or unreviewed AI codes remain.
export const handle = withAuth(async (request, user) => {
  const { id } = schema.parse(superjson.parse(await request.text()));
  const enc = await db.selectFrom("encounters").select(["id", "status"]).where("id", "=", id).executeTakeFirst();
  if (!enc) throw Object.assign(new Error("Claim not found."), { status: 404 });
  if (enc.status === "approved") return { ok: true } satisfies OutputType;

  const scored = await claimScoring(id);
  const blockers = scored.hits.filter((h) => h.severity === "block").length;
  if (blockers) throw Object.assign(new Error(`Fix ${blockers} blocking issue${blockers === 1 ? "" : "s"} before approving.`), { status: 409 });
  const pending = await db
    .selectFrom("claimLines")
    .select("id")
    .where("encounterId", "=", id)
    .where("source", "=", "ai_suggested")
    .where("status", "=", "proposed")
    .execute();
  if (pending.length) throw Object.assign(new Error(`Accept or reject the ${pending.length} AI suggestion${pending.length === 1 ? "" : "s"} first.`), { status: 409 });

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("encounters")
      .set({ status: "approved", approvedBy: user.id, approvedAt: new Date(), updatedAt: new Date() })
      .where("id", "=", id)
      .execute();
    await trx
      .insertInto("auditLog")
      .values({ encounterId: id, userId: user.id, action: "claim.approved", detail: { riskScore: scored.riskScore } as never })
      .execute();
  });
  return { ok: true } satisfies OutputType;
});