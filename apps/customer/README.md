# @dilivygo/customer — Customer ordering storefront

The customer-facing web app of **Dilivygo Community Edition**: online ordering
for a **single restaurant** — browse the menu, build a cart, check out with
Stripe, and track the order live. No marketplace, no multi-vendor browsing:
this app serves one restaurant's storefront.

## What it does

- **Storefront** — menu browsing with categories, search, dietary tags, and
  promo banners (`src/app/(main)`)
- **Cart & checkout** — cart with scheduled orders, address book, Stripe
  payment (`cart`, `checkout`, `addresses`)
- **Order tracking** — live order status, delivery map, receipts, reorder
  (`orders`, `orders/[id]`)
- **Account** — profile, favorites, wallet, order history, reviews & ratings
  (`account`, `favorites`, `wallet`)
- **Support chat** — customer↔restaurant messaging (`chat`, `chat-popup`)
- **Theming / white-label** — per-restaurant branding via the theme engine
  (`@dilivygo/theme-engine`, `@dilivygo/ui`)

## Tech

Next.js 16 (App Router) + React 19, TanStack Query, Zustand, Tailwind CSS 4,
`@dilivygo/api` typed client against `apps/server`.

```bash
npm run dev     # http://localhost:3000
npm run build
npm run lint
npm run test    # vitest
```

## Scope notes (Community Edition)

- This app talks only to the CE API (`apps/server`). Commercial-only
  surfaces — rider fleet, dispatch, superadmin console, SaaS dashboard,
  app-builder, CX surveys/cases, marketing campaigns — are not part of this
  codebase and have no UI here.
- Multi-shop browsing (marketplace mode) is not a CE feature; the storefront
  resolves a single restaurant (`NEXT_PUBLIC_PROJECT_REF`).
