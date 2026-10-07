# Dilivygo Community Edition

**The free, open-source restaurant management system** — POS, vendor tools, and
single-restaurant online ordering. Own your software, your data, and your
customer relationship. No commissions, no revenue share, ever.

## What this is

A complete restaurant operating system you can self-host in minutes:

- **POS** — browser-based point of sale (counter sales, queue, checkout, print
  reconciliation) plus an Electron desktop shell with hardware drivers
  (`apps/pos`, `apps/pos-desktop`)
- **Vendor dashboard** — menu & catalog management, shops & geofences, orders,
  live order view, promo codes, analytics, reviews, Stripe Connect
  (`apps/vendor`, `apps/vendor-mobile`)
- **Customer ordering** — storefront, cart, Stripe checkout, order tracking,
  favorites, reviews (`apps/customer`, `apps/customer-mobile`)
- **API server** — one Express backend: REST + WebSocket hub, PostgreSQL,
  Redis, BullMQ jobs (`apps/server`)
- **Shared packages** — UI kit, typed API client, i18n (15+ languages, RTL),
  theming/white-label engine, chat components (`packages/`)

## What this is not

This repository is the **Community Edition**: the restaurant OS. It does not
include the commercial **Marketplace suite** — rider fleet app, dispatch
engine, superadmin console, app-builder, and multi-vendor orchestration live in
a separate private codebase.

**Stripe note:** the vendor dashboard's Stripe Connect onboarding is Community
Edition — it lets a restaurant connect *its own* Stripe account so card
payments settle directly to the restaurant. Platform-to-vendor money movement
(Connect transfers, marketplace payouts, revenue splits) is commercial
Marketplace-suite machinery and is not present here.

## Community vs Cloud vs Marketplace

| | Community (this repo) | Dilivygo Cloud | Marketplace suite |
|---|---|---|---|
| License | AGPLv3, free forever | Commercial SaaS | Commercial license |
| Hosting | You host it | We host it | We host it |
| Scope | Single-restaurant OS | Restaurant OS, managed | Multi-vendor marketplace |
| Support | GitHub Discussions | Email/SLA | Dedicated |

You are free to run the Community Edition yourself, forever. Or we run it for
you — hosting, updates, backups, monitoring, app-store releases — starting at
$99/mo. When you're ready to launch your own multi-vendor marketplace, that's
the Marketplace suite (from $499/mo).

## Quickstart — 5-minute seeded demo

Requirements: Docker.

```bash
cp .env.example .env
docker compose up -d
# one-time database setup: apply 179 migrations + grant PostgREST roles
docker compose run --rm db-setup
# seed the demo restaurant:
docker compose exec app npm run demo:seed
```

Then open:

- Customer storefront: http://localhost:3000
- Vendor dashboard: http://localhost:3001 (login: `owner@demo.com` / `demo1234`)
- POS: http://localhost:3004 (login: `cashier@demo.com` / `demo1234`)
- API: http://localhost:8080/api/health

The demo seeds one fictional restaurant ("Demo Diner") with a menu, staff
accounts, and sample orders. Reset anytime:

```bash
docker compose exec app npm run demo:reset
docker compose exec app npm run demo:seed
```

> Local uploads (product images) need the Supabase Storage API, which the
> Compose stack intentionally omits — uploads log a warning instead of
> crashing. For full functionality, point `SUPABASE_URL` at a hosted Supabase
> project instead.

### Without Docker

```bash
npm install
# start Postgres + Redis however you like, then:
cp .env.example .env   # point DATABASE_URL / REDIS_URL at them
npm run dev            # turbo: server + customer + vendor + pos
```

## Configuration

All settings live in `.env` (see `.env.example` — every variable is
documented). Highlights:

- `DILIVYGO_EDITION=community` (default) — disables commercial code paths.
- `DATABASE_URL` — Postgres. Docker Compose provides one automatically.
- `REDIS_URL` — optional; without it the server uses an in-memory fallback
  (fine for demo, not for production).
- External services (Stripe, Resend, Twilio, FCM) are **optional**. Unset keys
  get demo-safe fallbacks: Stripe uses a dummy processor, SMS/email/push
  become no-ops that log instead of sending. You can click through the entire
  product without any third-party account.

## Repository layout

```
apps/
  customer/          Next.js storefront        (port 3000)
  customer-mobile/   Expo app                  (mobile)
  vendor/            Next.js vendor dashboard  (port 3001)
  vendor-mobile/     Expo app                  (mobile)
  pos/               Next.js browser POS       (port 3004)
  pos-desktop/       Electron POS shell        (desktop)
  server/            Express API + jobs        (port 8080)
packages/
  ui/                shared component kit
  api/               typed API client
  types/             shared TypeScript contracts
  i18n/              translations (15+ locales)
  chat/              in-app chat components
  theme-engine/      white-label theming
  tenant-host/       multi-tenant host middleware
  logos/             brand assets
  observability/    logging/Sentry wrappers
```

## Contributing

We welcome contributions! Start with `CONTRIBUTING.md`, sign the `CLA.md` on
your first PR (one comment), and respect `TRADEMARK.md` — the code is AGPLv3,
the Dilivygo name and logos are trademarks.

## Security

See `SECURITY.md`. Report vulnerabilities to security@dilivygo.com — never in a
public issue.

## License

GNU Affero General Public License v3.0 — see `LICENSE`. If you run a modified
version as a network service, you must offer its source to your users. That's
the deal that keeps restaurant software free.
