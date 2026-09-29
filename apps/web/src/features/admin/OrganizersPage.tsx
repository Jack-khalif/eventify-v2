import {
  CITIES,
  citySchema,
  formatMoney,
  formatRate,
  isStandardRate,
  type AdminOrganizerRow,
} from '@eventify/shared';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Card, SelectField, Tag } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AdminPage } from './AdminLayout';
import { ORGANIZER_STATUS } from './format';
import { QueryView } from './QueryView';
import { useAdminMe, useAdminOrganizers } from './useAdmin';

const RATE_BANDS = { standard: 'Standard (5%)', negotiated: 'Negotiated' } as const;
type RateBand = keyof typeof RATE_BANDS;

const filterClass = '[&_label]:sr-only [&_select]:h-10 [&_select]:text-sm';

export function OrganizersPage() {
  useDocumentTitle('Organizers');
  const isSuper = useAdminMe().data?.role === 'super_admin';
  const query = useAdminOrganizers();
  const [params, setParams] = useSearchParams();
  const agent = params.get('agent') ?? '';
  const band = (params.get('rate') ?? '') as RateBand | '';
  const city = citySchema.safeParse(params.get('city')).data;
  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  const agents = [
    ...new Map(
      (query.data ?? []).flatMap((o) => (o.agent ? [[o.agent.id, o.agent.name] as const] : [])),
    ),
  ];

  return (
    <AdminPage
      title="Organizers"
      actions={
        <>
          {isSuper && (
            <SelectField
              label="Agent"
              value={agent}
              onChange={(e) => set('agent', e.target.value)}
              className={filterClass}
            >
              <option value="">All agents</option>
              {agents.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
              <option value="none">No agent</option>
            </SelectField>
          )}
          <SelectField
            label="Rate"
            value={band}
            onChange={(e) => set('rate', e.target.value)}
            className={filterClass}
          >
            <option value="">All rates</option>
            {Object.entries(RATE_BANDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="City"
            value={city ?? ''}
            onChange={(e) => set('city', e.target.value)}
            className={filterClass}
          >
            <option value="">All cities</option>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
        </>
      }
    >
      <QueryView query={query} label="organizers">
        {(rows) => {
          const shown = rows.filter(
            (o) =>
              (!agent || (agent === 'none' ? !o.agent : o.agent?.id === agent)) &&
              (!band || (band === 'standard') === isStandardRate(o.rateBps)) &&
              (!city || o.city === city),
          );
          return shown.length === 0 ? (
            <p className="m-0 text-muted">No organizers match these filters.</p>
          ) : (
            <OrganizerTable rows={shown} />
          );
        }}
      </QueryView>
    </AdminPage>
  );
}

function RateTag({ bps }: { bps: number }) {
  return <Tag tone={isStandardRate(bps) ? 'neutral' : 'accent'}>{formatRate(bps)}</Tag>;
}

function StatusTag({ status }: { status: AdminOrganizerRow['status'] }) {
  const s = ORGANIZER_STATUS[status];
  return <Tag tone={s.tone}>{s.label}</Tag>;
}

function OrganizerTable({ rows }: { rows: AdminOrganizerRow[] }) {
  const navigate = useNavigate();
  const href = (o: AdminOrganizerRow) => `/admin/organizers/${o.handle}`;
  return (
    <>
      <table className="hidden w-full border-collapse text-sm md:table">
        <thead>
          <tr className="border-b-2 border-rule text-left text-xs text-muted">
            {['Organizer', 'Category', 'City', 'Agent', 'Rate', 'Total sales', 'Status'].map(
              (h) => (
                <th key={h} scope="col" className="px-2 py-2.5 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr
              key={o.id}
              onClick={() => navigate(href(o))}
              className="cursor-pointer border-b border-hair hover:bg-surface"
            >
              <td className="px-2 py-3 font-semibold">
                <Link to={href(o)} className="text-fg no-underline hover:text-accent-text">
                  {o.name}
                </Link>
              </td>
              <td className="px-2 py-3">{o.category}</td>
              <td className="px-2 py-3">{o.city}</td>
              <td className="px-2 py-3">{o.agent?.name ?? '—'}</td>
              <td className="px-2 py-3">
                <RateTag bps={o.rateBps} />
              </td>
              <td className="px-2 py-3 whitespace-nowrap">
                {formatMoney(o.currency, o.salesMinor)}
              </td>
              <td className="px-2 py-3">
                <StatusTag status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:hidden">
        {rows.map((o) => (
          <li key={o.id}>
            <Card className="relative flex flex-col gap-1 p-4 hover:bg-surface">
              <Link
                to={href(o)}
                className="font-extrabold text-fg no-underline after:absolute after:inset-0"
              >
                {o.name}
              </Link>
              <span className="text-xs text-muted">
                {o.category} · {o.city} · {o.agent?.name ?? 'No agent'}
              </span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <RateTag bps={o.rateBps} />
                <StatusTag status={o.status} />
                <Tag tone="outline">{formatMoney(o.currency, o.salesMinor)}</Tag>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
