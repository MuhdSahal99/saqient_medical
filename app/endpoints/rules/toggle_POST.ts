import superjson from "superjson";
import { db } from "../../helpers/db";
import { withAuth } from "../../helpers/withAuth";
import { schema, type OutputType } from "./toggle_POST.schema";

// Admin only. Each change bumps the rule version and is written to the audit log.
export const handle = withAuth(
  async (request, user) => {
    const { ruleId, active } = schema.parse(superjson.parse(await request.text()));
    await db.transaction().execute(async (trx) => {
      const rule = await trx
        .updateTable("payerRules")
        .set((eb) => ({ active, version: eb("version", "+", 1), updatedAt: new Date() }))
        .where("id", "=", ruleId)
        .returning(["ruleKey", "version"])
        .executeTakeFirst();
      if (!rule) throw Object.assign(new Error("Rule not found."), { status: 404 });
      await trx
        .insertInto("auditLog")
        .values({ userId: user.id, action: active ? "rule.enabled" : "rule.disabled", detail: { ruleKey: rule.ruleKey, version: rule.version } as never })
        .execute();
    });
    return { ok: true } satisfies OutputType;
  },
  { roles: ["admin"] }
);