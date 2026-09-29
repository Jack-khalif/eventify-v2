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

## Checks (the same ones CI runs)

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Conventions

- Money is stored as integers in minor units (`priceMinor: 120000` = KSh 1,200). Format with `formatMoney`.
- Fee rates are basis points (`450` = 4.5%). Use `feeFor` / `organizerNetFor`.
- Phone numbers are stored as E.164 (`+254712345678`). Normalise input with `normalizePhone`.
- Times are ISO 8601 with an offset and shown in EAT (`Africa/Nairobi`).
