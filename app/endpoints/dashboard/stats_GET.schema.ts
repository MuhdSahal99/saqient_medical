import superjson from "superjson";

export type OutputType = {
  totals: {
    claims: number;
    needsReview: number;
    ready: number;
    approved: number;
    errors: number;
    avgRisk: number | null;
    billed: number;
    billedAtRisk: number;
    issuesCaught: number;
    blockersCaught: number;
  };
  topIssues: { ruleName: string; severity: string; count: number }[];
  riskBuckets: { bucket: string; count: number }[];
  byPayer: { payerName: string; claims: number; avgRisk: number }[];
  ai: { runs: number; cachedRuns: number; credits: number; guardrailBlocks: number };
};

export const getDashboardStats = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/dashboard/stats`, { method: "GET", ...init });
  if (!result.ok) throw new Error(superjson.parse<{ error: string }>(await result.text()).error);
  return superjson.parse<OutputType>(await result.text());
};