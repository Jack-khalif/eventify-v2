import {
  defaultTier,
  formatMoney,
  MAX_TICKETS_PER_ORDER,
  tierAvailability,
  type PublicEvent,
} from '@eventify/shared';
import { useState } from 'react';

type Initial = { tierId?: string | null; quantity?: number };

/**
 * Selected tier and quantity. Shared by the event page (aside + mobile buy bar) and checkout,
 * which starts from what was picked on the event page. Unavailable tiers fall back to the default.
 */
export function useTicketSelection(event: PublicEvent, initial: Initial = {}) {
  const [tierId, setTierId] = useState(() => {
    const wanted = event.tiers.find((t) => t.id === initial.tierId);
    return wanted && tierAvailability(wanted).status === 'on_sale'
      ? wanted.id
      : (defaultTier(event.tiers)?.id ?? null);
  });
  const [quantity, setQuantity] = useState(() =>
    Number.isInteger(initial.quantity) && initial.quantity! > 0 ? initial.quantity! : 1,
  );

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
