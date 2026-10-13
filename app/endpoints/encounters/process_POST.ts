import superjson from "superjson";
import { db } from "../../helpers/db";
import { withAuth } from "../../helpers/withAuth";
import { agentPipeline } from "../../helpers/agentPipeline";
import { schema, type OutputType } from "./process_POST.schema";

export const handle = withAuth(async (request, user) => {
  const { id } = schema.parse(superjson.parse(await request.text()));
  const enc = await db.selectFrom("encounters").select(["id", "status"]).where("id", "=", id).executeTakeFirst();
  if (!enc) throw Object.assign(new Error("Claim not found."), { status: 404 });
  if (enc.status === "approved") throw Object.assign(new Error("Approved claims cannot be re-processed."), { status: 409 });

  const result = await agentPipeline(id);
  await db
    .insertInto("auditLog")
    .values({ encounterId: id, userId: user.id, action: "pipeline.completed", detail: { riskScore: result.riskScore, status: result.status } as never })
    .execute();
  return { id, riskScore: result.riskScore, readinessScore: result.readinessScore, status: result.status } satisfies OutputType;
});