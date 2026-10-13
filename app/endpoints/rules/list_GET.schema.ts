import superjson from "superjson";
import type { Selectable } from "kysely";
import type { PayerRules } from "../../helpers/schema";

export type OutputType = { rules: (Omit<Selectable<PayerRules>, "params"> & { params: unknown; hitCount: number })[] };

export const getRules = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/rules/list`, { method: "GET", ...init });
  if (!result.ok) throw new Error(superjson.parse<{ error: string }>(await result.text()).error);
  return superjson.parse<OutputType>(await result.text());
};