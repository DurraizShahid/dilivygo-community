# Contributing to Dilivygo Community Edition

Thanks for wanting to help! This is the free, open-source restaurant
management system: POS, vendor tools, and single-restaurant ordering.

## Before you start

- Read `README.md` (project overview), `TRADEMARK.md` (brand rules), and
  `CLA.md` (sign once via your first PR comment).
- Good first areas: bug fixes in POS/vendor/customer apps, translations
  (`packages/i18n`), docs, and demo seed data.

## Workflow

1. Fork the repo and create a branch: `fix/short-description` or
   `feat/short-description`.
2. One logical change per PR. Keep diffs focused and reviewable.
3. Run the checks that apply to your change:
   - Server: `npm test --workspace=dilivygo-backend` (Jest)
   - Customer web: `npm test --workspace=@dilivygo/customer` (Vitest)
   - Lint/format: repo uses ESLint + Prettier — run them before pushing.
4. Write a clear PR description: what changed, why, how you tested it.
   Screenshots/GIFs for UI changes are strongly encouraged.
5. A maintainer reviews; address feedback with new commits on the same branch.

## Code conventions

- Server (`apps/server`) is plain JavaScript (CommonJS). Keep it that way —
  no TypeScript migration PRs, please.
- Web/mobile apps are TypeScript + React. Follow the existing patterns in each
  app; shared UI goes in `packages/ui`, shared types in `packages/types`.
- Migrations are append-only: never edit an existing file in
  `apps/server/migrations/`; add a new one.
- Never commit secrets, API keys, or real customer data. The demo seed uses
  fictional data only.

## What we won't merge

- Features belonging to the commercial Marketplace suite (rider/dispatch
  fleet management, superadmin console, app-builder, multi-vendor
  orchestration) — these live in a separate private codebase by design.
- White-label branding changes that hard-code a specific business.
- Large refactors without a prior discussion (open an issue first).

## Translations

`packages/i18n` holds locale files. Additions and corrections are very
welcome — please keep the English source keys unchanged and mirror the key
structure in the locale you add.

## Questions?

Open a GitHub Discussion. For security issues, see `SECURITY.md` — do not
open a public issue.
