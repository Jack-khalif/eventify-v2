import {
  defaultTier,
  formatMoney,
  MAX_TICKETS_PER_ORDER,
  tierAvailability,
  type PublicEvent,
} from '@eventify/shared';
import { useState } from 'react';

/** Selected tier and quantity for an event page. The aside and the mobile buy bar share this. */
export function useTicketSelection(event: PublicEvent) {
  const [tierId, setTierId] = useState(() => defaultTier(event.tiers)?.id ?? null);
  const [quantity, setQuantity] = useState(1);

  const tier = event.tiers.find((t) => t.id === tierId) ?? null;
  const availability = tier ? tierAvailability(tier) : null;
  const remaining = availability?.status === 'on_sale' ? availability.remaining : null;
  const maxQuantity = Math.max(1, Math.min(MAX_TICKETS_PER_ORDER, remaining ?? Infinity));
  const qty = Math.min(quantity, maxQuantity);
  const totalMinor = tier ? tier.priceMinor * qty : 0;

  return {
    tier,
    selectTier: (id: string) => setTierId(id),
    quantity: qty,
    setQuantity,
    maxQuantity,
    canBuy: tier !== null && availability?.status === 'on_sale',
    isFree: tier !== null && tier.priceMinor === 0,
    lineLabel: tier ? `${qty} × ${tier.name}` : '',
    totalLabel: totalMinor === 0 ? 'Free' : formatMoney(event.currency, totalMinor),
    checkoutPath: tier ? `/e/${event.slug}/checkout?tier=${tier.id}&qty=${qty}` : '',
  };
}

export type TicketSelection = ReturnType<typeof useTicketSelection>;
