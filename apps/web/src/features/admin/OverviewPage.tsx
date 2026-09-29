import {
  CATEGORIES,
  categorySchema,
  CITIES,
  citySchema,
  CURRENCY_LABEL,
  currencySchema,
  formatMoney,
  formatRate,
  DEFAULT_RATE_BPS,
  OVERVIEW_RANGES,
  type AdminOverview,
  type Currency,
} from '@eventify/shared';
import { Link, useSearchParams } from 'react-router';
import { BarChart } from '../../components/BarChart';
import { Card, Segmented, SelectField } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AdminPage } from './AdminLayout';
import { count, FAILURE_LABEL, formatMoneyList } from './format';
import { QueryView } from './QueryView';
import { useOverview } from './useAdmin';

const CURRENCIES = (['KES', 'SSP'] as const).map((c) => ({ value: c, label: CURRENCY_LABEL[c] }));

/** Filters live in the URL, so a view can be shared and Back works. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const days = Number(params.get('days'));
  const filters = {
    days: (OVERVIEW_RANGES as readonly number[]).includes(days) ? days : 30,
    city: citySchema.safeParse(params.get('city')).data,
    category: categorySchema.safeParse(params.get('category')).data,
    currency: currencySchema.safeParse(params.get('currency')).data ?? 'KES',
  };
  const set = (key: string, value: string | undefined) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );
  return { filters, set };
}

export function OverviewPage() {
  useDocumentTitle('Admin overview');
  const { filters, set } = useFilters();
  const query = useOverview(filters);

  return (
    <AdminPage
      title="Overview"
      actions={
        <>
          <SelectField
            label="Period"
            value={String(filters.days)}
            onChange={(e) => set('days', e.target.value === '30' ? undefined : e.target.value)}
            className="[&_label]:sr-only [&_select]:h-10 [&_select]:text-sm"
          >
            {OVERVIEW_RANGES.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </SelectField>
          <SelectField
            label="City"
            value={filters.city ?? ''}
            onChange={(e) => set('city', e.target.value || undefined)}
            className="[&_label]:sr-only [&_select]:h-10 [&_select]:text-sm"
          >
            <option value="">All cities</option>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <SelectField
            label="Category"
            value={filters.category ?? ''}
            onChange={(e) => set('category', e.target.value || undefined)}
            className="[&_label]:sr-only [&_select]:h-10 [&_select]:text-sm"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <Segmented
            label="Currency"
            options={CURRENCIES}
            value={filters.currency}
            onChange={(c: Currency) => set('currency', c === 'KES' ? undefined : c)}
          />
        </>
      }
    >
      <QueryView query={query} label="the overview">
        {(o) => <Overview o={o} />}
      </QueryView>
    </AdminPage>
  );
}

function Overview({ o }: { o: AdminOverview }) {
  const money = (minor: number) => formatMoney(o.currency, minor);
  const stats = [
    { label: 'Ticket sales (gross)', value: money(o.grossMinor), sub: `Last ${o.days} days` },
    { label: 'Eventify revenue', value: money(o.feesMinor), sub: 'Fees earned' },
    {
      label: 'Pending payouts',
      value: formatMoneyList(o.pendingPayouts),
      sub: `${o.pendingPayoutCount} ${o.pendingPayoutCount === 1 ? 'organizer' : 'organizers'} owed`,
    },
    { label: 'Live events', value: count(o.liveEvents), sub: 'On sale now' },
    {
      label: 'Active organizers',
      value: count(o.activeOrganizers),
      sub: `of ${o.organizerCount}`,
    },
  ];
  const failed = o.payments.attempts - o.payments.succeeded;
  const okPct = o.payments.attempts ? (o.payments.succeeded / o.payments.attempts) * 100 : 100;
  const topFailure = Math.max(...o.payments.failures.map((f) => f.count), 1);

  return (
    <>
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="flex flex-col gap-1.5 p-4">
            <dt className="text-xs font-semibold text-muted">{s.label}</dt>
            <dd className="m-0 text-2xl font-extrabold tracking-[-0.02em]">{s.value}</dd>
            <dd className="m-0 text-[11px] font-bold text-accent-text">{s.sub}</dd>
          </Card>
        ))}
      </dl>

      <div className="flex flex-wrap gap-4">
        <Card className="flex min-w-0 flex-[2_1_480px] flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-base">Ticket sales over time</h2>
            <span className="text-[13px] text-muted">{money(o.grossMinor)} processed</span>
          </div>
          <BarChart
            daily={o.dailyGrossMinor}
            format={money}
            caption="Ticket sales per day"
            valueLabel="Sales"
            empty="No sales in this period."
          />
        </Card>

        <Card className="flex flex-[1_1_260px] flex-col gap-3 p-5">
          <h2 className="m-0 text-base">Payment health</h2>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[13px]">
              <span>M-Pesa successful</span>
              <span className="font-bold">{okPct.toFixed(1)}%</span>
            </div>
            <div aria-hidden className="h-2 overflow-hidden rounded bg-surface-2">
              <div className="h-full bg-accent" style={{ width: `${okPct}%` }} />
            </div>
          </div>
          <span className="text-xs text-muted">
            {count(failed)} of {count(o.payments.attempts)} payment prompts failed · all markets
          </span>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {o.payments.failures.map((f) => (
              <li key={f.reason} className="flex flex-col gap-1">
                <div className="flex justify-between text-[13px]">
                  <span>{FAILURE_LABEL[f.reason]}</span>
                  <span className="text-muted">{count(f.count)}</span>
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded bg-surface-2">
                  <div
                    className="h-full bg-muted"
                    style={{ width: `${(f.count / topFailure) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <Card className="flex flex-[1_1_360px] flex-col gap-2 p-5">
          <h2 className="m-0 text-base">Top organizers by Eventify revenue</h2>
          {o.topOrganizers.length === 0 ? (
            <p className="m-0 text-sm text-muted">No sales in {CURRENCY_LABEL[o.currency]} yet.</p>
          ) : (
            <ol className="m-0 list-none p-0">
              {o.topOrganizers.map((t) => (
                <li key={t.handle} className="border-b border-hair">
                  <Link
                    to={`/admin/organizers/${t.handle}`}
                    className="flex justify-between gap-3 px-1 py-2.5 text-fg no-underline hover:bg-surface"
                  >
                    <span className="font-semibold">{t.name}</span>
                    <span className="font-bold">{money(t.feesMinor)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card className="flex flex-[1_1_220px] flex-col gap-1.5 p-5">
          <h2 className="m-0 text-base">Average fee rate</h2>
          <span className="text-3xl font-extrabold">{formatRate(o.avgRateBps)}</span>
          <span className="text-xs text-muted">
            Across {o.organizerCount} organizers · standard rate is {formatRate(DEFAULT_RATE_BPS)}
          </span>
        </Card>
      </div>
    </>
  );
}
