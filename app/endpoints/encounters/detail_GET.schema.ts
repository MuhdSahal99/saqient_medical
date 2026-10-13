import { z } from "zod";
import superjson from "superjson";
import type { Selectable } from "kysely";
import type { AgentRuns, AuditLog, ClaimLines, Encounters, ExtractedFacts, RuleHits } from "../../helpers/schema";
import type { PreauthState } from "../../helpers/rulesEngine";
import type { RiskReason } from "../../helpers/riskModel";

export const schema = z.object({ id: z.coerce.number().int().positive() });
export type InputType = z.infer<typeof schema>;

export type OutputType = {
  encounter: Omit<Selectable<Encounters>, "preauth" | "riskReasons"> & {
    payerName: string;
    platform: string;
    preauth: PreauthState | null;
    riskReasons: RiskReason[];
  };
  lines: Selectable<ClaimLines>[];
  facts: Selectable<ExtractedFacts>[];
  hits: Selectable<RuleHits>[];
  agentRuns: Selectable<AgentRuns>[];
  audit: (Selectable<AuditLog> & { userName: string | null })[];
};

export const getClaimDetail = async (id: number, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/encounters/detail?id=${id}`, { method: "GET", ...init });
  if (!result.ok) throw new Error(superjson.parse<{ error: string }>(await result.text()).error);
  return superjson.parse<OutputType>(await result.text());
};