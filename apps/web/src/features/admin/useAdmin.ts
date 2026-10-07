import {
  adminAgentRowSchema,
  adminApplicationRowSchema,
  adminApprovalRowSchema,
  adminMeSchema,
  adminOrganizerDetailSchema,
  adminOrganizerRowSchema,
  adminOverviewSchema,
  adminPayoutRowSchema,
  rateChangeResultSchema,
  type OrganizerStatusChange,
  type OverviewQuery,
  type RateChangeRequest,
} from '@eventify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet, apiPost } from '../../lib/api';

/** Everything admin lives under this key, so any change refreshes it all. */
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

/** Organizers waiting to be approved. Super Admin only. */
export function useApplications({ enabled = true } = {}) {
  return useQuery({
    queryKey: [ADMIN, 'applications'],
    queryFn: () => apiGet('/api/admin/applications', z.array(adminApplicationRowSchema)),
    enabled,
  });
}

/** Approve, decline, suspend or reinstate an organizer. */
export function useSetOrganizerStatus() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ handle, status }: { handle: string } & OrganizerStatusChange) =>
      apiPost(
        `/api/admin/organizers/${encodeURIComponent(handle)}/status`,
        { status },
        adminOrganizerDetailSchema,
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
