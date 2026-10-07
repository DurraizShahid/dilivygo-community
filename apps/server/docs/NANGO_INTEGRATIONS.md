# Nango integration layer

Dilivygo uses Nango for restaurant-owned external account authorization and credential lifecycle management. Nango is **not** a replacement for Dilivygo runtime integrations such as payment execution, maps, push delivery, wallets, or the platform AI provider.

## Architecture

The customer-facing catalog contains 54 approved integrations and classifies them into three modes:

- `nango` — a restaurant connects its own external account through Nango.
- `native` — the runtime integration is managed directly by Dilivygo and does not use a customer Nango connection.
- `nango_partner` — Nango is the connection/auth layer after the upstream provider grants commercial or partner API access.

Current totals:

- 35 standard Nango connections
- 10 Dilivygo-native integrations
- 9 Nango + provider-partner integrations

The catalog is defined in `apps/server/lib/saas-integration-catalog.js`. Its `nangoIntegrationId` values are stable Dilivygo-owned integration IDs. The same IDs must exist in the target Nango environment.

## Server configuration

Configure these variables only on the backend service:

```text
NANGO_SECRET_KEY=<Nango environment API key>
NANGO_BASE_URL=https://api.nango.dev
NANGO_TIMEOUT_MS=15000
```

`NANGO_BASE_URL` and `NANGO_TIMEOUT_MS` are optional. `NANGO_SECRET_KEY` is required to enable Nango-backed connections.

Never expose the Nango API key through a `NEXT_PUBLIC_*` variable or return it to a client.

### Recommended Nango API-key scopes

The integration layer currently needs:

- `environment:connect_sessions:write`
- `environment:connections:list`
- `environment:connections:delete`

A full-access environment key also works, but production should use the least privileges above where possible.

## Nango environment setup

For every catalog item whose mode is `nango` or `nango_partner`:

1. Create/configure the provider in the correct Nango environment.
2. Set its integration ID to the exact `nangoIntegrationId` from `saas-integration-catalog.js`.
3. For OAuth providers, register the required OAuth developer application with the provider and configure its client ID, client secret, scopes, and callback URL in Nango.
4. For API-key/basic-auth providers, configure the Nango integration so Connect UI collects the provider's required credentials.
5. Test at least one connection in the Nango environment before enabling it for production customers.

Nango connect links are created server-side. Dilivygo sends only the short-lived `connect_link` to the authenticated SaaS UI.

## Multi-tenant isolation

Every Connect session is tagged with:

```text
organization_id=<Dilivygo SaaS organization ID>
end_user_id=<Clerk user ID>
```

Dilivygo lists connections using `tags[organization_id]` and then **re-validates the returned connection's `organization_id` tag before reconnect or deletion**. This second check prevents a connection returned unexpectedly by the upstream service from being used across tenants.

Only SaaS `owner` and `admin` roles can list, connect, reconnect, or disconnect organization integrations.

## Connection lifecycle

The SaaS UI calls:

```text
GET    /api/saas/integrations
POST   /api/saas/integrations/:key/connect-session
POST   /api/saas/integrations/:key/reconnect-session
DELETE /api/saas/integrations/:key/connections/:connectionId
```

The backend creates Nango Connect sessions, returns a short-lived authorization link, reads connection status without credentials, and validates ownership before destructive operations.

Credentials and refresh tokens remain in Nango. The SaaS UI never receives them.

## Payment integrations

For providers such as PayPal, Adyen, Square, Tabby, Tamara, EasyPaisa, and JazzCash, Nango can manage the restaurant/provider account authorization or credentials where supported. **It does not replace Dilivygo's payment execution code.** Charges, refunds, webhooks, idempotency, ledger behavior, and payment security remain provider-specific Dilivygo backend responsibilities.

Stripe, Stripe Connect, Apple Pay, and Google Pay are currently classified as native because their existing Dilivygo payment lifecycle should not be moved behind a generic integration broker.

## Marketplace / restaurant ecosystem providers

Uber Eats, Deliveroo, DoorDash, Talabat, Careem, Zomato, Swiggy, Foodpanda, and Oracle Micros are marked `nango_partner`.

Nango can manage authorization/credentials once the provider permits the connection, but it **cannot grant Dilivygo commercial API access**. Provider partnership, restaurant eligibility, API contracts, credentials, certification, or production approval must be completed with each upstream provider first.

## Native integrations

The following are intentionally not routed through Nango:

- Stripe
- Stripe Connect
- Apple Pay
- Google Pay
- Firebase FCM
- OneSignal
- Google Maps
- Mapbox
- HERE Maps
- OpenAI

They are platform/runtime services rather than customer-owned SaaS OAuth connections in the current Dilivygo architecture.

## Production checklist

Before merging/deploying this feature:

- Run the backend Jest suite, including `tests/nango-integrations.test.js`.
- Run SaaS TypeScript/typecheck and lint gates.
- Add `NANGO_SECRET_KEY` to the backend deployment environment.
- Configure every intended Nango integration ID in the matching Nango environment.
- Configure each provider's OAuth application or API credential requirements.
- Obtain partner API approval for marketplace/POS providers before presenting them as directly connectable.
- Test connect, reconnect, status refresh, and disconnect with two separate Dilivygo organizations to verify tenant isolation.
- Use separate Nango environments/keys for development and production.

## What this layer does not do

A successful Nango connection proves that Dilivygo can securely obtain/use an authorized provider account through Nango. It does **not** by itself implement every provider's business workflows. Provider-specific syncs/actions still need to map external data into Dilivygo domains (for example accounting exports, CRM customer sync, marketplace order ingestion, or support ticket creation).
