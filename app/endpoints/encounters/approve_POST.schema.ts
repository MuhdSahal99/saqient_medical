import { z } from "zod";
import superjson from "superjson";

export const schema = z.object({ id: z.number().int().positive() });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postApproveEncounter = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validated = schema.parse(body);
  const result = await fetch(`/_api/encounters/approve`, {
    method: "POST",
    body: superjson.stringify(validated),
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) throw new Error(superjson.parse<{ error: string }>(await result.text()).error);
  return superjson.parse<OutputType>(await result.text());
};