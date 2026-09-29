import {
  DEFAULT_RATE_BPS,
  formatDate,
  formatMoney,
  formatRate,
  isStandardRate,
  type AdminMe,
  type AdminOrganizerDetail,
} from '@eventify/shared';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Card, Tag } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ORGANIZER_STATUS, PAYOUT_METHOD, PAYOUT_STATUS } from './format';
import { QueryView } from './QueryView';
import { RateDialog } from './RateDialog';
import { useAdminMe, useAdminOrganizer } from './useAdmin';

export function OrganizerDetailPage() {
  const { handle = '' } = useParams();
  const query = useAdminOrganizer(handle);
  const me = useAdminMe().data;
  useDocumentTitle(query.data?.name ?? 'Organizer');

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-5 pt-5 pb-12">
      <Link
        to="/admin/organizers"
        className="inline-flex items-center self-start rounded-md py-1.5 pr-2.5 pl-1 text-sm font-extrabold text-fg no-underline hover:bg-surface"
      >
        <ChevronLeft size={18} strokeWidth={2.4} aria-hidden />
        All organizers
      </Link>
      <QueryView query={query} label="this organizer">
        {(org) => (me ? <Detail org={org} me={me} /> : null)}
      </QueryView>
    </div>
  );
}

function Detail({ org, me }: { org: AdminOrganizerDetail; me: AdminMe }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const status = ORGANIZER_STATUS[org.status];
  const pending = org.pendingApproval;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[26px] tracking-[-0.02em]">{org.name}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span>
              {org.category} · {org.city} · {org.agent ? `agent ${org.agent.name}` : 'no agent'}
            </span>
            <Tag tone={status.tone}>{status.label}</Tag>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-muted">Total sales</span>
          <span className="text-2xl font-extrabold">
            {formatMoney(org.currency, org.salesMinor)}
          </span>
        </div>
      </div>

      {notice && (
        <p role="status" className="m-0 rounded-xl bg-good-soft p-3.5 text-sm font-bold text-good">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <Card className="flex flex-[1_1_260px] flex-col gap-2 p-5">
          <h2 className="m-0 text-xs font-semibold text-muted">Fee rate</h2>
          <div className="flex items-baseline gap-2.5">
            <span className="text-3xl font-extrabold" data-testid="org-rate">
              {formatRate(org.rateBps)}
            </span>
            <Tag tone={isStandardRate(org.rateBps) ? 'neutral' : 'accent'}>
              {isStandardRate(org.rateBps) ? 'Standard' : 'Negotiated'}
            </Tag>
          </div>
          <span className="text-xs text-muted">
            Standard rate is {formatRate(DEFAULT_RATE_BPS)}. Rate changes apply only to future
            ticket sales.
          </span>
          {pending && (
            <p className="m-0 rounded-lg bg-surface px-3 py-2 text-[13px]">
              <strong>{formatRate(pending.requestedBps)}</strong> is waiting for Super Admin
              approval.
            </p>
          )}
          <Button block className="mt-1.5" onClick={() => setDialogOpen(true)}>
            Change rate
          </Button>
        </Card>

        <Card className="flex flex-[2_1_380px] flex-col gap-1 p-5">
          <h2 className="m-0 text-xs font-semibold text-muted">Events</h2>
          {org.events.length === 0 ? (
            <p className="m-0 text-sm text-muted">No events yet.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {org.events.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-hair py-2.5 text-sm"
                >
                  <span className="font-semibold">{e.title}</span>
                  <span className="flex items-center gap-2 text-muted">
                    {e.rateBps !== null && (
                      <Tag tone="accent">{formatRate(e.rateBps)} for this event</Tag>
                    )}
                    {formatDate(e.startsAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-[1_1_260px] flex-col gap-1.5 p-5">
          <h2 className="m-0 text-xs font-semibold text-muted">Payout</h2>
          {org.payout ? (
            <>
              <span className="text-[22px] font-extrabold">
                {formatMoney(org.payout.currency, org.payout.amountMinor)}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {PAYOUT_METHOD[org.payout.method]}
                <Tag tone={PAYOUT_STATUS[org.payout.status].tone}>
                  {PAYOUT_STATUS[org.payout.status].label}
                </Tag>
              </span>
              {org.payout.reference && (
                <span className="font-mono text-xs text-muted">Ref {org.payout.reference}</span>
              )}
            </>
          ) : (
            <span className="text-sm text-muted">
              Nothing owed · paid by {PAYOUT_METHOD[org.payoutMethod]}
            </span>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-1 p-5">
        <h2 className="m-0 text-xs font-semibold text-muted">Rate history</h2>
        {org.rateHistory.length === 0 ? (
          <p className="m-0 text-sm text-muted">Always on the standard rate.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {org.rateHistory.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap justify-between gap-3 border-b border-hair py-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold">
                    {formatRate(h.oldBps)} → {formatRate(h.newBps)}
                    {h.eventTitle && (
                      <span className="font-normal text-muted"> · {h.eventTitle} only</span>
                    )}
                  </span>
                  <span className="text-xs text-muted">{h.reason}</span>
                </div>
                <div className="flex flex-col gap-0.5 text-right">
                  <span className="text-[13px] font-semibold">{h.changedBy}</span>
                  <span className="text-xs text-muted">{formatDate(h.at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {dialogOpen && (
        <RateDialog
          org={org}
          role={me.role}
          onClose={() => setDialogOpen(false)}
          onDone={(message) => {
            setDialogOpen(false);
            setNotice(message);
          }}
        />
      )}
    </>
  );
}
