import { z } from "zod";
import superjson from "superjson";

export const schema = z.object({
  lineId: z.number().int().positive(),
  action: z.enum(["accept", "reject", "make_primary", "reset"]),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; riskScore: number; readinessScore: number; status: string };

export const postUpdateLine = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validated = schema.parse(body);
  const result = await fetch(`/_api/encounters/update_line`, {
    method: "POST",
    body: superjson.stringify(validated),
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) throw new Error(superjson.parse<{ error: string }>(await result.text()).error);
  return superjson.parse<OutputType>(await result.text());
};