import {
  adminAgentRowSchema,
  adminApprovalRowSchema,
  adminMeSchema,
  adminOrganizerDetailSchema,
  adminOrganizerRowSchema,
  adminOverviewSchema,
  adminPayoutRowSchema,
  rateChangeResultSchema,
  type AdminRole,
  type OverviewQuery,
  type RateChangeRequest,
} from '@eventify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet, apiPost } from '../../lib/api';

/** Everything admin lives under this key, so a role switch or a change refreshes it all. */
const ADMIN = 'admin';

function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [ADMIN] });
}

export function useAdminMe() {
  return useQuery({
    queryKey: [ADMIN, 'me'],
    queryFn: () => apiGet('/api/admin/me', adminMeSchema),
  });
}

/** Demo only, until sign-in (Phase A9): view the portal as Super Admin or as an agent. */
export function useSetDemoRole() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (role: AdminRole) => apiPost('/api/admin/demo-role', { role }, adminMeSchema),
    onSuccess: invalidate,
  });
}

export function useOverview(query: OverviewQuery) {
  return useQuery({
    queryKey: [ADMIN, 'overview', query],
    queryFn: () =>
      apiGet('/api/admin/overview', adminOverviewSchema, {
        days: String(query.days ?? 30),
        city: query.city,
        category: query.category,
        currency: query.currency,
      }),
  });
}

export function useAdminOrganizers() {
  return useQuery({
    queryKey: [ADMIN, 'organizers'],
    queryFn: () => apiGet('/api/admin/organizers', z.array(adminOrganizerRowSchema)),
  });
}

export function useAdminOrganizer(handle: string) {
  return useQuery({
    queryKey: [ADMIN, 'organizers', handle],
    queryFn: () =>
      apiGet(`/api/admin/organizers/${encodeURIComponent(handle)}`, adminOrganizerDetailSchema),
  });
}

export function useChangeRate(handle: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (req: RateChangeRequest) =>
      apiPost(
        `/api/admin/organizers/${encodeURIComponent(handle)}/rate`,
        req,
        rateChangeResultSchema,
      ),
    onSuccess: invalidate,
  });
}

export function useApprovals({ enabled = true } = {}) {
  return useQuery({
    queryKey: [ADMIN, 'approvals'],
    queryFn: () => apiGet('/api/admin/approvals', z.array(adminApprovalRowSchema)),
    enabled,
  });
}

export function useResolveApproval() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      apiPost(
        `/api/admin/approvals/${encodeURIComponent(id)}/${decision}`,
        {},
        z.object({ ok: z.literal(true) }),
      ),
    onSuccess: invalidate,
  });
}

export function useAgents() {
  return useQuery({
    queryKey: [ADMIN, 'agents'],
    queryFn: () => apiGet('/api/admin/agents', z.array(adminAgentRowSchema)),
  });
}

export function useAdminPayouts() {
  return useQuery({
    queryKey: [ADMIN, 'payouts'],
    queryFn: () => apiGet('/api/admin/payouts', z.array(adminPayoutRowSchema)),
  });
}

export function useMarkPaid() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, reference }: { id: string; reference: string }) =>
      apiPost(
        `/api/admin/payouts/${encodeURIComponent(id)}/paid`,
        { reference },
        adminPayoutRowSchema,
      ),
    onSuccess: invalidate,
  });
}
