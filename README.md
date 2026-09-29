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
