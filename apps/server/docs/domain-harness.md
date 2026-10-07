# Local hostname harness

Domain Forwarding v2 can be exercised **entirely locally and in CI** with no
real DNS, no TLS issuance, and no hosting-provider (Vercel) credentials. The
harness fakes the two external surfaces the domain lifecycle touches — the
database and the provider — and injects the `Host` header directly, so every
policy decision (reserved labels, shadow suffixes, cross-scope holds,
fail-closed resolution) is deterministic and offline.

---

## What "offline" guarantees

- **No network egress.** The in-memory Supabase fake's `supabaseFetch` rejects
  with `HARNESS_NETWORK_DISABLED`; the fake domain provider never leaves the
  process. A test that accidentally reaches out fails loudly instead of hitting
  a real tenant or provider.
- **No real credentials.** No `SUPABASE_*`, `VERCEL_*`, `STRIPE_*`, or
  `SAAS_DNS_APEX` value is required. Tests set the apex they want in-test.
- **No live tenant can be touched.** All rows live in a per-test in-memory
  store seeded by the fixtures.

---

## Files

| File | Purpose |
|---|---|
| `tests/helpers/domain-fixtures.js` | In-memory Supabase fake + org/workspace/hostname factories + a two-org world |
| `tests/helpers/host-request.js` | `Host`-header supertest helper (`hostRequest`, `hostFor`, `etcHostsSnippet`) |
| `tests/domain-harness-matrix.test.js` | The exhaustive matrix (claim policy, lifecycle, provider errors, tenancy, resolution) |

### `domain-fixtures.js`

- `createInMemorySupabase()` — a `supabase`-shaped client: `select`, `insert`,
  `update`, `remove`, `executeSQL`, `supabaseFetch`. Supports `filters` (equality
  and array → SQL `in`), `rawFilters`, `order` (`'field.asc' | 'field.desc'`),
  `limit`, `offset`. Rows are inspectable via `__rows(table)` / `__seed(table,
  rows)` / `__clear()`.
- `createTwoOrgWorld()` — two organizations and their workspaces/hostnames:
  - org `alpha.test` with workspaces `vendor-alpha.test`, `pos-alpha.test`
    (plus `riders-alpha.test`)
  - org `beta.test` with workspaces `vendor-beta.test`, `pos-beta.test`
    (plus `riders-beta.test`)
  - actors: `alpha`, `beta`, `member` (non-owner)
- `__dbInterface` / `__setDB` — the module-level current DB that the mocked
  `lib/supabase` hands out. A test calls `__setDB(createInMemorySupabase())`
  before seeding.
- **Override keys are snake_case.** `makeOrgHostname` / `makeWorkspaceHostname`
  store snake_case columns; pass overrides as `organization_id` /
  `workspace_id`. CamelCase keys are silently ignored by the row inserter —
  a real pitfall that produced a passing-looking but mis-seeded fixture.

### `host-request.js`

The trust boundary reads only `req.headers.host` in the dev path
(`config.trustProxyHops === 0`, which is how tests boot). So the harness drives
routing with supertest's `.set('Host', …)` rather than `X-Forwarded-Host`:

```js
const { hostRequest, hostFor } = require('./helpers/host-request');
await hostRequest(app, hostFor('shop', 'customer')).get('/api/public/theme');
```

`hostRequest` is a proxy over `supertest(app)` that binds the `Host` header for
every verb, so call sites read like normal supertest.

---

## The fake domain provider

`services/domain-provider.js` exposes `getDomainProvider()`. Under
`NODE_ENV=test` it returns `global.__fakeDomainProvider`, so no Vercel client is
ever constructed. Contract:

| Call | Behavior |
|---|---|
| `attach(target)` | Validates `target.vercelProject === 'dilivygo-' + surface`, else throws `INVALID_TARGET` (400). Registers the domain as `dns_pending`. |
| `verify(id)` #1 | `{ dns: 'ok', tls: 'pending' }` → the domain moves to `verifying`. |
| `verify(id)` #2 | `{ dns: 'ok', tls: 'ready' }` → the domain becomes `active`. |
| `verify(id)` unknown | `{ dns: 'error', tls: 'error', errorCode: 'NOT_FOUND' }`. |
| `detach(id)` | Idempotent. |
| `attach` on a host owned elsewhere | Idempotent in the fake; the "already owned by another project" path is exercised by **spying**, not by the fake — see below. |

Errors are thrown as `DomainProviderError(message, { code, statusCode, cause,
retryable })` (`code` defaults to `PROVIDER_ERROR`, `statusCode` to `502`,
`retryable` true for 5xx/429). To simulate a provider that recovers, stub one
call and let the next succeed:

```js
jest.spyOn(provider, 'attach').mockImplementationOnce(async () => {
  throw new DomainProviderError('owned elsewhere', { code: 'OWNED_ELSEWHERE', statusCode: 409 });
});
// next attach() goes back to the fake implementation and succeeds
```

---

## The apex `config.saas.dnsApex`

Apex-scoped checks (reserved platform labels, apex shadow suffixes) only run
when `SAAS_DNS_APEX` is configured. The matrix sets it in `beforeAll` and
restores it in `afterAll`:

```js
const originalSaas = config.saas;
beforeAll(() => { config.saas = { ...(config.saas || {}), dnsApex: 'test' }; });
afterAll(() => { config.saas = originalSaas; });
```

Without this, `superadmin.test` and `evil.customer.test` would not raise
`HOSTNAME_RESERVED` / `HOSTNAME_APEX_SHADOW_FORBIDDEN` and the matrix would
pass for the wrong reason.

---

## Running it

```bash
# from apps/server — the full matrix on its own
npx jest domain-harness-matrix

# the domain cluster (matrix + every suite it must not regress, incl. the
# Prompt 15 reconciliation job + superadmin diagnostics)
npx jest domain-reconciliation-job superadmin-domain-diagnostics \
  domain-harness-matrix domain-service domain-provider host-scope \
  resolve-host secure-host-resolution saas-domains-routes
```

Backend jest is configured for `NODE_ENV=test`, `tests/**/*.test.js`,
`maxWorkers: 1`, and `clearMocks`/`restoreMocks` on. The setup file sets
`NODE_ENV=test`, which is what selects the fake provider.

Expected result at the time of writing: **39/39** for the matrix and **9
suites / 199 tests** for the cluster (169 baseline + 13 job + 17 diagnostics).
`jobs-boot` (11 tests) is also green — the `domain-reconciliation` job is part
of the registered registry. The three pre-existing `chat.test.js`
support-ticket failures (404-vs-201 baseline) are unrelated and are not part of
this cluster.

---

## Reconciliation job & support diagnostics (Prompt 15)

- The job talks to the **same in-memory Supabase fake** (the suite mocks
  `../lib/supabase` with an **indirection wrapper** that re-reads
  `fixtures.__dbInterface.<method>` at call time — required because
  `domain-service` destructures `select`/`update`/`insert`/`remove` once at
  require time, so monkeypatching `__dbInterface` after load is otherwise
  invisible to the service). Update columns live on `__dbInterface.update`.
- Provider progression is injected, not timed: `runOnce({ skipLock, provider,
  now })` is called with a real fake provider or a stubbed one
  (`mockImplementationOnce` throws → next call succeeds). The job's lock is
  mocked via `jest.mock('../lib/lock')`; a lock that returns `null` must yield
  `{ skipped: true }`.
- **No wall-clock sleeps, ever.** "Backoff in the future" is asserted by
  comparing the persisted `next_reconcile_at` against the fixture clock `T0`,
  not by waiting.
- The diagnostics suite mounts the **real** `requireSuperadmin` and `validate`
  middlewares on a mini express app and drives `getSupportDiagnostic` /
  `getTelemetrySnapshot` over the same fake DB — and asserts the only three
  buffer methods called are `select` (never insert/update/remove) and that
  `global.fetch` is never invoked.

---

## Adding a case

1. Seed rows with the factories (remember snake_case override keys), or build a
   fresh world with `createTwoOrgWorld()`.
2. Call the service directly for policy/lifecycle assertions —
   `claimDomain`, `beginVerification`, `refreshDomainStatus`, `setPrimaryDomain`,
   `removeDomain`, `resolveActiveHostname`.
3. Use `hostRequest` only when you need the HTTP/routing layer; host resolution
   itself is asserted in `secure-host-resolution.test.js` and
   `resolve-host.test.js`.
4. Assert on typed error codes, not message strings:
   `await expect(...).rejects.toMatchObject({ statusCode: 409, code: 'HOSTNAME_TAKEN' })`.
5. Never sleep. Provider progression is driven by explicit `verify` calls, not
   by wall-clock time.

---

## Scope boundaries

- **WebSocket `Origin` validation** is out of scope by design — the harness
  covers HTTP host resolution; WS access is covered separately
  (`websocket.test.js`, `chat-ws-access.test.js`).
- **Real provider semantics** (actual TTLs, retry schedules, TLS issuance
  timing) are not simulated. The fake models the *state transitions* the service
  depends on, not the provider's internals.
- **`apps/server` only.** The SaaS UI's pure display logic has its own vitest
  suite (`apps/saas/src/app/dashboard/settings/domains/domain-display.test.ts`).
