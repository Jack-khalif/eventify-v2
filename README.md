# Eventify v2

Event ticketing for Kenya and South Sudan: M-Pesa checkout, SMS and email tickets, offline door check-in.

The designs in `design/` (exported from Claude Design) are the source of truth for every screen.

## Layout

| Path              | What                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| `apps/web`        | React app: public site, organizer tools, door scanner and admin portal       |
| `apps/api`        | Backend API (Phase B)                                                        |
| `packages/shared` | Zod schemas, types, money/phone helpers and fixtures used by web and API     |
| `design/`         | Claude Design export. Open `design/EventifyApp.dc.html` in a browser to view |

## Getting started

Requires Node 22 or newer (`.nvmrc` pins 24).

```sh
npm install
npm run dev        # web app on http://localhost:5173
```

Until the backend exists, a mock API (MSW, in `apps/web/src/mocks`) answers `/api/*` in the browser using the sample data in `packages/shared`. See `apps/web/.env.example` to turn it off.

### Who can do what

Sign-in is a phone number and a one-time SMS code (`/login`); there are no passwords. The rules live in `packages/shared/src/access.ts` and the API must enforce them too.

| Who                  | Can                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------- |
| Guest (no sign-in)   | Browse, buy tickets, find tickets by phone, scan at the door with a check-in link   |
| Attendee (signed in) | The same, with their tickets shown without a second code; can apply to host         |
| Organizer, pending   | See their application's progress. Cannot create events until a Super Admin approves |
| Organizer, active    | Dashboard and Create event                                                          |
| Organizer, suspended | Dashboard for past events; cannot create events                                     |
| Agent                | Admin portal, limited to organizers they onboarded                                  |
| Super Admin          | Whole admin portal, including approving, declining and suspending organizers        |

With the mock API the code is always `123456`. Sample accounts: `0700 000 001` organizer, `0700 000 002` organizer waiting for approval, `0700 000 003` suspended organizer, `0700 000 010` agent, `0700 000 020` Super Admin. Any other number signs in as a new attendee.

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
