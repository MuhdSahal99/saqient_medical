import superjson from "superjson";
import type { Market } from "../../helpers/schema";

export type PayerOption = { id: number; code: string; name: string; market: Market; platform: string; baseDenialRate: number };
export type OutputType = { payers: PayerOption[] };

export const getPayers = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/reference/payers`, { method: "GET", ...init });
  if (!result.ok) throw new Error(superjson.parse<{ error: string }>(await result.text()).error);
  return superjson.parse<OutputType>(await result.text());
};