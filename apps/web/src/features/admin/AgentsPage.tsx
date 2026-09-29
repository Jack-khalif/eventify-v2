import { formatRate } from '@eventify/shared';
import { Card } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AdminPage } from './AdminLayout';
import { formatMoneyList } from './format';
import { QueryView } from './QueryView';
import { useAgents } from './useAdmin';

const HEADERS = [
  'Agent',
  'Organizers onboarded',
  'Sales generated',
  'Revenue for Eventify',
  'Avg. rate',
];

export function AgentsPage() {
  useDocumentTitle('Agents');
  const query = useAgents();
  return (
    <AdminPage title="Agents" width="max-w-[1100px]">
      <QueryView query={query} label="agents">
        {(rows) => (
          <>
            <table className="hidden w-full border-collapse text-sm md:table">
              <thead>
                <tr className="border-b-2 border-rule text-left text-xs text-muted">
                  {HEADERS.map((h) => (
                    <th key={h} scope="col" className="px-2 py-2.5 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-hair">
                    <td className="px-2 py-3 font-semibold">{a.name}</td>
                    <td className="px-2 py-3">{a.organizers}</td>
                    <td className="px-2 py-3">{formatMoneyList(a.sales)}</td>
                    <td className="px-2 py-3">{formatMoneyList(a.fees)}</td>
                    <td className="px-2 py-3">
                      {a.avgRateBps === null ? '—' : formatRate(a.avgRateBps)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:hidden">
              {rows.map((a) => (
                <li key={a.id}>
                  <Card className="flex flex-col gap-1 p-4">
                    <span className="font-extrabold">{a.name}</span>
                    <span className="text-xs text-muted">
                      {a.organizers} organizers · avg{' '}
                      {a.avgRateBps === null ? '—' : formatRate(a.avgRateBps)}
                    </span>
                    <span className="mt-1 text-sm">Sales {formatMoneyList(a.sales)}</span>
                    <span className="text-sm">Eventify revenue {formatMoneyList(a.fees)}</span>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryView>
    </AdminPage>
  );
}
