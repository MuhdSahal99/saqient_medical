import { z } from "zod";
import superjson from "superjson";
import { EncounterStatusArrayValues, type EncounterStatus, type Market } from "../../helpers/schema";

export const schema = z.object({
  status: z.enum(EncounterStatusArrayValues).optional(),
  search: z.string().trim().max(60).optional(),
});
export type InputType = z.infer<typeof schema>;

export type ClaimRow = {
  id: number;
  patientRef: string;
  payerName: string;
  market: Market;
  specialty: string;
  encounterType: string;
  encounterDate: Date;
  billedAmount: string;
  status: EncounterStatus;
  riskScore: number | null;
  readinessScore: number | null;
  blockers: number;
  pendingSuggestions: number;
  createdAt: Date;
};
export type OutputType = { claims: ClaimRow[] };

export const getClaims = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  const result = await fetch(`/_api/encounters/list?${qs.toString()}`, { method: "GET", ...init });
  if (!result.ok) throw new Error(superjson.parse<{ error: string }>(await result.text()).error);
  return superjson.parse<OutputType>(await result.text());
};