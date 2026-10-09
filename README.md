# Eventify v2

Event ticketing for Kenya and South Sudan: M-Pesa checkout, SMS and email tickets, offline door check-in.

The designs in `design/` (exported from Claude Design) are the source of truth for every screen.

## Layout

| Path              | What                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| `apps/web`        | React app: public site, organizer tools, door scanner and admin portal       |
| `apps/api`        | Backend API (Hono, Postgres): everything the web app asks of `/api/*`        |
| `packages/shared` | Zod schemas, types, money/phone helpers and fixtures used by web and API     |
| `design/`         | Claude Design export. Open `design/EventifyApp.dc.html` in a browser to view |

## Getting started

Requires Node 22 or newer (`.nvmrc` pins 24).

```sh
npm install
npm run dev        # web app on http://localhost:5173
```

By default a mock API (MSW, in `apps/web/src/mocks`) answers `/api/*` in the browser using the sample data in `packages/shared`.

### The backend

`apps/api` is the real API (Hono, Postgres through Drizzle). It answers every path the mock does, from the database: browsing, buying and emailing tickets, sign-in, organizer applications and tools, door check-in and the admin portal. Payments are still simulated (see `PAYMENTS` below).

```sh
npm run dev:api    # API on http://localhost:8787
```

To point the web app at it, put `VITE_API_MOCKS=off` in `apps/web/.env.local` and restart `npm run dev`.

With no settings at all it runs on its own: the database is a local file (`apps/api/.data`, delete it to start again) filled with the sample organizers, sign-ins and events, emails and SMS (tickets and one-time codes) are printed in the terminal, and M-Pesa is simulated the same way as in the mock (a phone ending `0000`, `1111`, `2222` or `3333` fails). Sign in with a sample account from the table below and read the code off the terminal. Copy `apps/api/.env.example` to `apps/api/.env` to change that:

| Setting                     | What it does                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`            | Send ticket emails through [Resend](https://resend.com) instead of printing them                                                               |
| `EMAIL_FROM`                | Sender address. Needs a domain verified in Resend to reach anyone but your own Resend email                                                    |
| `DATABASE_URL`              | Use a real Postgres. Run `npm run db:migrate --workspace @eventify/api` after every pull                                                       |
| `PAYMENTS`                  | `simulated` or `off` (free tickets only). Production defaults to `off`                                                                         |
| `AT_USERNAME`, `AT_API_KEY` | [Africa's Talking](https://africastalking.com) account that texts the "Find my tickets" code. Without one, production turns phone lookup off   |
| `QR_PRIVATE_KEY`            | Key that signs ticket QR codes; make one with `npm run keygen --workspace @eventify/api`                                                       |
| `SITE_URL`                  | Where the web app lives, for the ticket links in emails                                                                                        |
| `SUPER_ADMIN_EMAILS`        | Comma-separated emails that are Super Admins when they sign in (how the first admin gets in)                                                   |
| `TRUST_PROXY`               | Proxies between visitors and the API (`1` behind the host alone, `2` when the web host forwards `/api` too), so rate limits count each visitor |

Protections worth knowing about:

- **Sessions** are held in two halves: a cookie scripts can't read, and a token the web app sends back. The API needs both, so the web app and the API have to share a site: put the API on a subdomain of the web app's domain, or forward `/api/*` from the web host to the API (a rewrite in `apps/web/vercel.json`) and leave `VITE_API_URL` empty. On two unrelated addresses, browsers won't send the cookie and nobody stays signed in.
- **Two-step sign-in** (an authenticator app, set up under Admin → Security) is open to all staff. In production a Super Admin can't approve organizers, change rates, record payouts or manage staff until theirs is on (`REQUIRE_TWO_STEP`).
- **Staff** are added and removed under Admin → Staff, and each organizer's agent is picked on the organizer's page. `SUPER_ADMIN_EMAILS` is only for the first admin.
- **Rate limits**: sign-in codes and checkouts are limited per visitor (and codes per email or phone), and one phone number can hold three unpaid orders at a time.
- **Staff sessions** end after 12 hours; everyone else's after 30 days.
- **Audit log**: every change made in the admin portal is written to the `audit_log` table with who made it.

What the numbers mean on the real API:

- **Posters** are stored in the database and served from `/api/images/{id}` (JPEG, PNG or WebP, 2 MB at most).
- **Payouts** appear in the admin portal ten minutes after an event ends: one per event, its paid orders less the fee each order was sold at. A Super Admin sends the money by hand and records the reference.
- **Page views** on the organizer dashboard count requests for the event page.

After changing `apps/api/src/db/schema.ts`, run `npm run db:generate --workspace @eventify/api` and commit the new file in `apps/api/drizzle`.

### Who can do what

Sign-in is an email address and a one-time code sent to it (`/login`); there are no passwords and no SMS. The rules live in `packages/shared/src/access.ts` and the API must enforce them too.

| Who                  | Can                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------- |
| Guest (no sign-in)   | Browse, buy tickets, find tickets by phone, scan at the door with a check-in link   |
| Attendee (signed in) | The same, with their tickets shown without a second code; can apply to host         |
| Organizer, pending   | See their application's progress. Cannot create events until a Super Admin approves |
| Organizer, active    | Dashboard and Create event                                                          |
| Organizer, suspended | Dashboard for past events; cannot create events                                     |
| Agent                | Admin portal, limited to organizers they onboarded                                  |
| Super Admin          | Whole admin portal, including approving, declining and suspending organizers        |

Organizers sign up and sign in with an email and password; staff sign in with a code sent to their email. With the mock API the sample organizers' password is `eventify-demo` and the code is always `123456`; the real API emails a new code each time, and its sample accounts have no password, so sign in to them with the code. To reset an organizer's forgotten password: `npm run set-password --workspace @eventify/api -- their@email 'new password'`. Sample accounts (in the mock, and in the API's local development database): `organizer@eventify.test`, `pending@eventify.test` (organizer waiting for approval), `suspended@eventify.test`, `agent@eventify.test` and `admin@eventify.test` (Super Admin). Any other email signs in as a new attendee.

In development, http://localhost:5173/dev/ui shows every UI component. Use the header toggle to check dark mode.

## Checks (the same ones CI runs)

```sh
npm run format:check
npm run lint
npm run typecheck
npm test           # or: npm run test:watch --workspace @eventify/web
npm run build
```

## Conventions

- Money is stored as integers in minor units (`priceMinor: 120000` = KSh 1,200). Format with `formatMoney`.
- Fee rates are basis points (`450` = 4.5%). Use `feeFor` / `organizerNetFor`.
- Phone numbers are stored as E.164 (`+254712345678`). Normalise input with `normalizePhone`.
- Colours come only from the design tokens in `apps/web/src/styles/tokens.css` (Tailwind: `bg-surface`, `text-muted`, `border-rule`…). Default Tailwind colours are switched off.
- Times are ISO 8601 with an offset and shown in EAT (`Africa/Nairobi`).
