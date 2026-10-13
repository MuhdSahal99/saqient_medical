import { z } from "zod";
import superjson from "superjson";
import { EncounterTypeArrayValues } from "../../helpers/schema";

export const schema = z.object({
  payerId: z.number().int().positive(),
  planName: z.string().trim().max(120).default(""),
  encounterType: z.enum(EncounterTypeArrayValues),
  specialty: z.string().trim().min(2).max(60),
  encounterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  billedAmount: z.number().min(0).max(10_000_000),
  patientRef: z.string().trim().min(2).max(40),
  noteText: z.string().trim().min(40, "The note is too short to code.").max(20000),
  submittedCodes: z.array(z.string().trim().min(2).max(12)).max(30).default([]),
});

export type InputType = z.input<typeof schema>;
export type OutputType = { id: number; redactionCount: number; redactionTypes: Record<string, number> };

export const postCreateEncounter = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validated = schema.parse(body);
  const result = await fetch(`/_api/encounters/create`, {
    method: "POST",
    body: superjson.stringify(validated),
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) throw new Error(superjson.parse<{ error: string }>(await result.text()).error);
  return superjson.parse<OutputType>(await result.text());
};