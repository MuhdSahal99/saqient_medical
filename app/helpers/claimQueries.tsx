import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPayers } from "../endpoints/reference/payers_GET.schema";
import { getClaims, type InputType as ClaimListInput } from "../endpoints/encounters/list_GET.schema";
import { getClaimDetail } from "../endpoints/encounters/detail_GET.schema";
import { postCreateEncounter } from "../endpoints/encounters/create_POST.schema";
import { postProcessEncounter } from "../endpoints/encounters/process_POST.schema";
import { postUpdateLine, type InputType as UpdateLineInput } from "../endpoints/encounters/update_line_POST.schema";
import { postApproveEncounter } from "../endpoints/encounters/approve_POST.schema";
import { getDashboardStats } from "../endpoints/dashboard/stats_GET.schema";
import { getRules } from "../endpoints/rules/list_GET.schema";
import { postToggleRule } from "../endpoints/rules/toggle_POST.schema";

// React Query hooks for every claim screen. Mutations invalidate the claim
// list, the claim detail and the dashboard so numbers never go stale.
const keys = {
  payers: ["payers"] as const,
  claims: (p: ClaimListInput) => ["claims", p] as const,
  claim: (id: number) => ["claim", id] as const,
  stats: ["dashboard-stats"] as const,
  rules: ["rules"] as const,
};

function useInvalidateClaims() {
  const qc = useQueryClient();
  return (id?: number) => {
    qc.invalidateQueries({ queryKey: ["claims"] });
    qc.invalidateQueries({ queryKey: keys.stats });
    qc.invalidateQueries({ queryKey: keys.rules });
    if (id) qc.invalidateQueries({ queryKey: keys.claim(id) });
  };
}

export const claimQueries = {
  usePayers: () => useQuery({ queryKey: keys.payers, queryFn: () => getPayers(), staleTime: 10 * 60_000 }),
  useClaims: (p: ClaimListInput) =>
    useQuery({ queryKey: keys.claims(p), queryFn: () => getClaims(p), placeholderData: (prev) => prev }),
  useClaim: (id: number) => useQuery({ queryKey: keys.claim(id), queryFn: () => getClaimDetail(id), enabled: id > 0 }),
  useStats: () => useQuery({ queryKey: keys.stats, queryFn: () => getDashboardStats() }),
  useRules: () => useQuery({ queryKey: keys.rules, queryFn: () => getRules() }),

  useCreateClaim: () => {
    const invalidate = useInvalidateClaims();
    return useMutation({ mutationFn: postCreateEncounter, onSuccess: () => invalidate() });
  },
  useProcessClaim: () => {
    const invalidate = useInvalidateClaims();
    return useMutation({
      mutationFn: (id: number) => postProcessEncounter({ id }),
      onSettled: (_d, _e, id) => invalidate(id),
    });
  },
  useUpdateLine: (claimId: number) => {
    const invalidate = useInvalidateClaims();
    return useMutation({
      mutationFn: (input: UpdateLineInput) => postUpdateLine(input),
      onSettled: () => invalidate(claimId),
    });
  },
  useApprove: () => {
    const invalidate = useInvalidateClaims();
    return useMutation({
      mutationFn: (id: number) => postApproveEncounter({ id }),
      onSettled: (_d, _e, id) => invalidate(id),
    });
  },
  useToggleRule: () => {
    const invalidate = useInvalidateClaims();
    return useMutation({ mutationFn: postToggleRule, onSettled: () => invalidate() });
  },
};