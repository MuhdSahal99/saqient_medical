import { z } from "zod";
import superjson from "superjson";

export const schema = z.object({ id: z.number().int().positive() });
export type InputType = z.infer<typeof schema>;
export type OutputType = { id: number; riskScore: number; readinessScore: number; status: string };

export const postProcessEncounter = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validated = schema.parse(body);
  const result = await fetch(`/_api/encounters/process`, {
    method: "POST",
    body: superjson.stringify(validated),
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const err = superjson.parse<{ error: string; code?: string }>(await result.text());
    throw Object.assign(new Error(err.error), { code: err.code });
  }
  return superjson.parse<OutputType>(await result.text());
};