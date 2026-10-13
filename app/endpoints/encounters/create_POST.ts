import superjson from "superjson";
import { db } from "../../helpers/db";
import { withAuth } from "../../helpers/withAuth";
import { phiRedaction } from "../../helpers/phiRedaction";
import { schema, type OutputType } from "./create_POST.schema";

export const handle = withAuth(async (request, user) => {
  const input = schema.parse(superjson.parse(await request.text()));

  const payer = await db.selectFrom("payers").select(["id", "market"]).where("id", "=", input.payerId).executeTakeFirst();
  if (!payer) throw Object.assign(new Error("Unknown payer."), { status: 404 });

  // Guardrail: the patient reference must be pseudonymous.
  if (phiRedaction(input.patientRef).count > 0) {
    throw new Error("Use a pseudonymous patient reference (for example PT-1042), not a name, phone or ID number.");
  }

  // PHI is removed before the note is stored, so raw identifiers never reach the database or a model.
  const redacted = phiRedaction(input.noteText);

  const dxSystem = payer.market === "KSA" ? "ICD10AM" : "ICD10CM";
  const pxSystem = payer.market === "KSA" ? "ACHI" : "CPT";
  const codes = Array.from(new Set(input.submittedCodes.map((c) => c.toUpperCase())));
  const known = codes.length
    ? await db
        .selectFrom("codeSets")
        .select(["system", "code", "description"])
        .where("code", "in", codes)
        .where("system", "in", [dxSystem, pxSystem])
        .execute()
    : [];

  const id = await db.transaction().execute(async (trx) => {
    const enc = await trx
      .insertInto("encounters")
      .values({
        createdBy: user.id,
        patientRef: input.patientRef,
        payerId: payer.id,
        planName: input.planName,
        market: payer.market,
        encounterType: input.encounterType,
        specialty: input.specialty,
        encounterDate: input.encounterDate,
        billedAmount: input.billedAmount,
        noteText: redacted.text,
        redactionCount: redacted.count,
        status: "processing",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    let primarySet = false;
    for (const code of codes) {
      const k = known.find((x) => x.code.toUpperCase() === code);
      // Unknown codes are kept so the rules engine can flag them.
      const looksDx = /^[A-Z]\d/.test(code);
      const system = k?.system ?? (looksDx ? dxSystem : pxSystem);
      const kind = system === "ICD10CM" || system === "ICD10AM" ? "diagnosis" : "procedure";
      const isPrimary = kind === "diagnosis" && !primarySet;
      if (isPrimary) primarySet = true;
      await trx
        .insertInto("claimLines")
        .values({
          encounterId: enc.id,
          kind,
          system,
          code,
          description: k?.description ?? "Not found in the active code set",
          source: "submitted",
          status: "accepted",
          isPrimary,
        })
        .execute();
    }

    await trx
      .insertInto("auditLog")
      .values({
        encounterId: enc.id,
        userId: user.id,
        action: "encounter.created",
        detail: { redactions: redacted.count, redactionTypes: redacted.types, submittedCodes: codes } as never,
      })
      .execute();
    return enc.id;
  });

  return { id, redactionCount: redacted.count, redactionTypes: redacted.types } satisfies OutputType;
});