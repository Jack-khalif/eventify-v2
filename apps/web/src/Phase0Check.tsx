/**
 * Temporary Phase 0 page: proves the web app can import the shared package,
 * and that every fixture passes its schema. Replaced by the real app shell in Phase A1.
 */
import {
  agentSchema,
  doorSchema,
  eventSchema,
  guestSchema,
  organizerDashboardSchema,
  organizerProfileSchema,
  organizerSchema,
  payoutSchema,
  priceLabel,
  rateApprovalSchema,
  rateChangeSchema,
} from '@eventify/shared';
import * as f from '@eventify/shared/fixtures';
import { z } from 'zod';

const checks = [
  ['Organizers', z.array(organizerSchema), f.organizers],
  ['Organizer profiles', z.array(organizerProfileSchema), f.organizerProfiles],
  ['Events', z.array(eventSchema), f.events],
  ['Doors', z.array(doorSchema), f.doors],
  ['Guests', z.array(guestSchema), f.guests],
  ['Dashboard', organizerDashboardSchema, f.sautiDashboard],
  ['Agents', z.array(agentSchema), f.agents],
  ['Rate changes', z.array(rateChangeSchema), f.rateChanges],
  ['Rate approvals', z.array(rateApprovalSchema), f.rateApprovals],
  ['Payouts', z.array(payoutSchema), f.payouts],
] as const;

const results = checks.map(([name, schema, data]) => {
  const parsed = schema.safeParse(data);
  return {
    name,
    count: Array.isArray(data) ? data.length : 1,
    ok: parsed.success,
    error: parsed.error ? z.prettifyError(parsed.error) : null,
  };
});

const eatDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Nairobi',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const organizerName = (id: string) => f.organizers.find((o) => o.id === id)?.name ?? id;

export function Phase0Check() {
  const allOk = results.every((r) => r.ok);

  return (
    <div className="page">
      <header className="header">
        <img src="/eventify-mark.png" alt="" width={40} height={21} />
        <span className="wordmark">EVENTIFY</span>
        <span className="tag">Phase 0 check</span>
      </header>

      <main className="main">
        <h1>
          Workspace is{' '}
          <span className={allOk ? 'hl' : 'hl bad'}>{allOk ? 'wired up' : 'broken'}</span>
        </h1>
        <p className="muted">
          This page imports schemas and sample data from <code>packages/shared</code> and validates
          them in the browser. It will be replaced by the real app in Phase A1.
        </p>

        <section className="card">
          <h2>Fixtures vs schemas</h2>
          <table>
            <tbody>
              {results.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="muted">{r.count}</td>
                  <td className={r.ok ? 'ok' : 'bad'}>{r.ok ? '✓ valid' : '✕ invalid'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {results
            .filter((r) => r.error)
            .map((r) => (
              <pre key={r.name}>{r.error}</pre>
            ))}
        </section>

        <section>
          <h2>Sample events ({f.events.length})</h2>
          <div className="grid">
            {f.events.map((e) => (
              <article key={e.id} className={`event tone-${e.coverTone}`}>
                <div className="cover" />
                <div className="body">
                  <div className="kicker">
                    {e.category} · {e.city}
                  </div>
                  <div className="title">{e.title}</div>
                  <div className="muted">{eatDate.format(new Date(e.startsAt))} EAT</div>
                  <div className="muted">{organizerName(e.organizerId)}</div>
                  <div className="price">{priceLabel(e)}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
