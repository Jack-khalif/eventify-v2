import { checkoutRequestSchema, orderViewSchema, type CheckoutRequest } from '@eventify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../lib/api';

/** How often the waiting screen asks whether the M-Pesa payment has landed (fast in tests). */
export const PAYMENT_POLL_MS = import.meta.env.MODE === 'test' ? 50 : 2_000;

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: () => apiGet(`/api/orders/${encodeURIComponent(orderId)}`, orderViewSchema),
    refetchInterval: (query) =>
      query.state.data?.status === 'awaiting_payment' || query.state.data?.status === 'pending'
        ? PAYMENT_POLL_MS
        : false,
    staleTime: 0,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CheckoutRequest) =>
      apiPost('/api/orders', checkoutRequestSchema.parse(req), orderViewSchema),
    onSuccess: (order) => queryClient.setQueryData(['order', order.id], order),
  });
}

/** Resend prompt / Try again, and Cancel. Both update the cached order immediately. */
export function useOrderAction(action: 'retry' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) =>
      apiPost(`/api/orders/${encodeURIComponent(orderId)}/${action}`, {}, orderViewSchema),
    onSuccess: (order) => queryClient.setQueryData(['order', order.id], order),
  });
}
