'use strict';

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const optional = (key, fallback = undefined) => process.env[key] || fallback;

/**
 * Normalize a platform host candidate (full URL or bare hostname) to a
 * lowercase hostname without scheme/port/trailing dot, or `null` when the
 * value is empty/not parseable.
 * @param {string|null} value
 * @returns {string|null}
 */
function normalizePlatformHost(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  const maybeUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate) ? candidate : `https://${candidate}`;
  try {
    return String(new URL(maybeUrl).hostname).replace(/\.$/, '').toLowerCase();
  } catch {
    return null;
  }
}

const publicServerUrl = optional('PUBLIC_SERVER_URL', '').replace(/\/$/, '');

// First-party platform hosts that bypass tenant host resolution. Built from the
// API's own public base URL plus `TRUSTED_PLATFORM_HOSTS`, so the deployment
// host keeps serving health/mobile/WS/probe traffic once host-scoping is
// enforced (SAAS_DNS_APEX). Plain Set property so tests can mutate it.
const platformHosts = new Set(
  [publicServerUrl]
    .concat(String(optional('TRUSTED_PLATFORM_HOSTS', '') || '').split(','))
    .map(normalizePlatformHost)
    .filter(Boolean)
);

const config = {
  env: optional('NODE_ENV', 'development'),
  edition: optional('DILIVYGO_EDITION', 'community'),
  port: parseInt(optional('PORT', '8080'), 10),
  isProd: process.env.NODE_ENV === 'production',
  trustProxyHops: Math.max(
    0,
    parseInt(optional('TRUST_PROXY_HOPS', process.env.NODE_ENV === 'production' ? '1' : '0'), 10) || 0
  ),

  /** Absolute public base of this API (no trailing slash) — used for uploaded platform logo URLs */
  publicServerUrl,

  /**
   * Lowercase hostnames (no scheme/port/trailing dot) treated as first-party
   * platform hosts. Requests carrying these Host headers are classified
   * `platform` by `secureHostResolution` without any tenant/DB lookup.
   * Sources: `PUBLIC_SERVER_URL` + `TRUSTED_PLATFORM_HOSTS` (comma-separated).
   */
  platformHosts,

  /** Stripe Connect Account Link return URLs (no trailing slash) */
  appUrls: {
    superadmin: optional('SUPERADMIN_APP_URL', 'http://localhost:3003'),
    vendor: optional('VENDOR_APP_URL', 'http://localhost:3001'),
  },

  /** Default country for new Express connected accounts (ISO 3166-1 alpha-2) */
  stripeConnectDefaultCountry: optional('STRIPE_CONNECT_DEFAULT_COUNTRY', 'GB'),

  session: {
    secret: optional('SESSION_SECRET', 'dev-secret-change-in-production'),
    adminTTL: 60 * 60 * 24,        // 24 hours in seconds
    customerTTL: 60 * 60 * 24 * 30, // 30 days in seconds
  },

  cors: {
    origins: optional(
      'ALLOWED_ORIGINS',
      'http://localhost:5173,http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3006',
    )
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },

  supabase: {
    url: optional('SUPABASE_URL', ''),
    // NOTE: service role key is required for server-side DB access (bypasses RLS).
    // We keep SUPABASE_SERVICE_KEY for backward compatibility, but prefer SUPABASE_SERVICE_ROLE_KEY.
    serviceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY', ''),
    serviceKey: optional('SUPABASE_SERVICE_KEY', ''),
    accessToken: optional('SUPABASE_ACCESS_TOKEN', ''),
  },

  redis: {
    url: optional('REDIS_URL'),
  },

  websocket: {
    maxBufferedAmountBytes: Math.max(0, parseInt(optional('WS_MAX_BUFFERED_BYTES', '1048576'), 10) || 0),
  },

  /**
   * Background job runner selection.
   *   - `auto` (default) — BullMQ when REDIS_URL is set, node-cron otherwise.
   *   - `bullmq`        — force BullMQ (fails fast if REDIS_URL is missing).
   *   - `cron`          — force node-cron even when Redis is available.
   *   - `off`           — do not start any jobs (tests / one-off scripts).
   */
  jobs: {
    runner: (optional('JOB_RUNNER', 'auto') || 'auto').toLowerCase(),
  },

  twilio: {
    accountSid: optional('TWILIO_ACCOUNT_SID'),
    authToken: optional('TWILIO_AUTH_TOKEN'),
    phoneNumber: optional('TWILIO_PHONE_NUMBER'),
    whatsappFrom: optional('TWILIO_WHATSAPP_FROM'),
    get enabled() {
      return !!(this.accountSid && this.authToken && this.phoneNumber);
    },
    get whatsappEnabled() {
      return !!(this.accountSid && this.authToken && this.whatsappFrom);
    },
  },

  email: {
    provider: optional('EMAIL_PROVIDER', 'resend'),
    apiKey: optional('EMAIL_API_KEY'),
    fromAddress: optional('EMAIL_FROM_ADDRESS', 'noreply@dilivygo.app'),
    get enabled() {
      return !!this.apiKey;
    },
  },

  stripe: {
    secretKey: optional('STRIPE_SECRET_KEY'),
    webhookSecret: optional('STRIPE_WEBHOOK_SECRET'),
    get enabled() {
      return !!this.secretKey;
    },
  },

  firebase: {
    serviceAccountJson: optional('FIREBASE_SERVICE_ACCOUNT_JSON'),
    get enabled() {
      return !!this.serviceAccountJson;
    },
  },

  google: {
    mapsApiKey: optional('GOOGLE_MAPS_API_KEY', ''),
  },

  ai: {
    enabled: String(optional('AI_ENABLED', '') || '').trim().toLowerCase() === 'true',
    provider: String(optional('AI_PROVIDER', 'disabled') || 'disabled').trim().toLowerCase(),
    apiKey: optional('AI_API_KEY', '').trim(),
    model: optional('AI_MODEL', '').trim(),
    baseUrl: optional('AI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
    timeoutMs: Math.min(60000, Math.max(1000, parseInt(optional('AI_TIMEOUT_MS', '15000'), 10) || 15000)),
    maxAttempts: Math.min(3, Math.max(1, parseInt(optional('AI_MAX_ATTEMPTS', '2'), 10) || 2)),
    maxInputChars: Math.min(50000, Math.max(1000, parseInt(optional('AI_MAX_INPUT_CHARS', '12000'), 10) || 12000)),
    maxOutputTokens: Math.min(4000, Math.max(1, parseInt(optional('AI_MAX_OUTPUT_TOKENS', '500'), 10) || 500)),
    disabledCapabilities: String(optional('AI_DISABLED_CAPABILITIES', '') || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    deepReasoningEnabled: String(optional('AI_DEEP_REASONING_ENABLED', '') || '').trim().toLowerCase() === 'true',
    actionSecret: optional('AI_ACTION_SECRET', '').trim(),
    actionTtlMinutes: Math.min(60, Math.max(1, parseInt(optional('AI_ACTION_TTL_MINUTES', '10'), 10) || 10)),
    modelSmall: optional('AI_MODEL_SMALL', '').trim(),
    modelStandard: optional('AI_MODEL_STANDARD', '').trim(),
    modelReasoning: optional('AI_MODEL_REASONING', '').trim(),
    fallbackEnabled: String(optional('AI_FALLBACK_ENABLED', '') || '').trim().toLowerCase() === 'true',
    fallbackBaseUrl: optional('AI_FALLBACK_BASE_URL', '').trim(),
    fallbackApiKey: optional('AI_FALLBACK_API_KEY', '').trim(),
    fallbackModel: optional('AI_FALLBACK_MODEL', '').trim(),
    responseCacheEnabled: String(optional('AI_RESPONSE_CACHE_ENABLED', '') || '').trim().toLowerCase() === 'true',
    globalMaxInputChars: Math.max(1000, parseInt(optional('AI_GLOBAL_MAX_INPUT_CHARS', '12000'), 10) || 12000),
    globalMaxOutputTokens: Math.max(100, parseInt(optional('AI_GLOBAL_MAX_OUTPUT_TOKENS', '1000'), 10) || 1000),
    globalMaxCalls: Math.min(5, Math.max(1, parseInt(optional('AI_GLOBAL_MAX_CALLS', '3'), 10) || 3)),
    dailyQuotaTokens: Math.max(0, parseInt(optional('AI_TENANT_DAILY_TOKENS', '200000'), 10) || 0),
    monthlyQuotaTokens: Math.max(0, parseInt(optional('AI_TENANT_MONTHLY_TOKENS', '2000000'), 10) || 0),
    priceInputPer1kUsd: Math.max(0, Number(optional('AI_PRICE_INPUT_PER_1K_USD', '0')) || 0),
    priceOutputPer1kUsd: Math.max(0, Number(optional('AI_PRICE_OUTPUT_PER_1K_USD', '0')) || 0),
    writesEnabled: String(optional('AI_ENABLE_WRITES', '') || '').trim().toLowerCase() === 'true',
    agenticEnabled: String(optional('AI_ENABLE_AGENTIC', '') || '').trim().toLowerCase() === 'true',
  },

  /**
   * Managed OAuth/credential layer for customer-owned third-party accounts.
   * Provider access/refresh tokens stay in Nango; Dilivygo stores only the
   * Nango connection id. Integration ID overrides let us use different Nango
   * Unique Keys per environment without changing application code.
   */
  nango: {
    secretKey: optional('NANGO_SECRET_KEY', '').trim(),
    webhookSigningKey: optional('NANGO_WEBHOOK_SIGNING_KEY', '').trim(),
    apiBaseUrl: optional('NANGO_API_BASE_URL', 'https://api.nango.dev').replace(/\/$/, ''),
    integrationIds: {
      quickbooks: optional('NANGO_INTEGRATION_QUICKBOOKS', 'quickbooks').trim(),
      xero: optional('NANGO_INTEGRATION_XERO', 'xero').trim(),
      hubspot: optional('NANGO_INTEGRATION_HUBSPOT', 'hubspot').trim(),
      slack: optional('NANGO_INTEGRATION_SLACK', 'slack').trim(),
      'microsoft-teams': optional('NANGO_INTEGRATION_MICROSOFT_TEAMS', 'microsoft-teams').trim(),
    },
    /**
     * Optional per-provider allowlist (comma-separated provider keys or Nango
     * integration IDs). When set, only listed providers report available=true
     * and accept connect sessions; everything else fails closed with
     * PROVIDER_NOT_CONFIGURED instead of presenting a broken Connect button.
     * When unset, every catalog provider follows the global enabled flag.
     */
    enabledIntegrations: optional('NANGO_ENABLED_INTEGRATIONS', '')
      .split(',')
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
    get enabled() {
      return !!this.secretKey;
    },
  },

  sentry: {
    dsn: optional('SENTRY_DSN'),
    get enabled() {
      return !!this.dsn;
    },
  },

  jwt: {
    secret: optional('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },

  otp: {
    ttl: 300,        // 5 minutes
    maxAttempts: 3,
    rateLimitCount: 3,
    rateLimitWindow: 900, // 15 minutes
  },

  rateLimit: {
    global: { windowMs: 60_000, max: 100 },
    auth: { windowMs: 60_000, max: 20 },
    payments: { windowMs: 60_000, max: 30 },
    ai: { windowMs: 60_000, max: 30 },
    // OPTIONAL: when set, requests carrying header
    // `X-Load-Test-Token: <value>` skip every rate limiter. Use only on
    // staging / load-test environments — never production. Never logged.
    bypassToken: process.env.LOAD_TEST_BYPASS_TOKEN || null,
  },

  chat: {
    maxMessageLength: 2000,
    pageSize: 50,
  },

  location: {
    updateIntervalSeconds: 3, // min seconds between rider location updates
    cacheTTL: 300,            // 5 minutes
    flushIntervalSeconds: 30,
  },

  messaging: {
    diagnosticRefSecret: optional(
      'MESSAGING_DIAGNOSTIC_REF_SECRET',
      optional('SESSION_SECRET', 'dev-messaging-ref-secret-minimum-32-chars!!')
    ),
  },

  /** Clerk (SaaS control plane + webhooks) */
  clerk: {
    secretKey: optional('CLERK_SECRET_KEY', ''),
    webhookSecret: optional('CLERK_WEBHOOK_SIGNING_SECRET', ''),
  },

  /**
   * SaaS multi-tenant DNS: apex used for `{ref}.{surface}.{apex}` hostnames
   * (e.g. `lvh.me` in dev). Optional until SaaS onboarding is enabled.
   */
  saas: {
    dnsApex: optional('SAAS_DNS_APEX', ''),
    /** Public URL of the SaaS dashboard app (e.g. http://localhost:3006) */
    appOrigin: optional('SAAS_APP_ORIGIN', ''),
  },

  /**
   * Workspace SaaS billing (Stripe Billing subscriptions + trials).
   * When `enabled` is false, subscription middleware does not block traffic.
   */
  saasBilling: {
    get enabled() {
      return String(optional('SAAS_BILLING_ENABLED', '') || '')
        .trim()
        .toLowerCase() === 'true';
    },
    priceId: optional('STRIPE_BILLING_PRICE_ID', '').trim(),
    /** Allow vendor mutations when status is past_due until this many days after current_period_end (0 = disallow). */
    pastDueGraceDays: Math.max(0, parseInt(optional('SAAS_BILLING_PAST_DUE_GRACE_DAYS', '0'), 10) || 0),
  },

  /**
   * Interactive OpenAPI UI at `/api/docs` (swagger-ui-express).
   * Disabled in production unless `ENABLE_API_DOCS=true`.
   */
  get enableApiDocs() {
    return (
      this.env !== 'production' ||
      String(optional('ENABLE_API_DOCS', '') || '')
        .trim()
        .toLowerCase() === 'true'
    );
  },

  /**
   * Hosting provider for custom domains — per-app Vercel projects (evidence:
   * `apps/customer|vendor|rider|pos/vercel.json` + `deployment-operations.mdc:1`).
   * Each surface is a separate Vercel project; TLS terminates at Vercel.
   * No shared proxy routes them; apex/wildcard already attached.
   */
  hosting: {
    provider: optional('HOSTING_PROVIDER', 'vercel').trim().toLowerCase(),
    vercel: {
      token: optional('VERCEL_TOKEN', '').trim(),
      teamId: optional('VERCEL_TEAM_ID', '').trim(),
      cnameTarget: optional('VERCEL_CNAME_TARGET', 'cname.vercel-dns.com').trim(),
      apexARecord: optional('VERCEL_APEX_A', '76.76.21.21').trim(),
      projects: {
        customer: optional('VERCEL_PROJECT_ID_CUSTOMER', 'dilivygo-customer').trim(),
        rider: optional('VERCEL_PROJECT_ID_RIDER', 'dilivygo-rider').trim(),
        vendor: optional('VERCEL_PROJECT_ID_VENDOR', 'dilivygo-vendor').trim(),
        pos: optional('VERCEL_PROJECT_ID_POS', 'dilivygo-pos').trim(),
      },
      get enabled() {
        return !!this.token;
      },
    },
  },

  /**
   * Domain reconciliation job cutout. When disabled, the job short-circuits
   * before touching the distributed lock, the DB, or the hosting provider —
   * useful during a staged custom-domain rollout or a provider outage. This is
   * a per-job switch: `JOB_RUNNER=off` remains the global kill switch.
   * Default: enabled (`DOMAIN_RECONCILIATION_ENABLED=false` to pause).
   */
  domainReconciliation: {
    get enabled() {
      return String(optional('DOMAIN_RECONCILIATION_ENABLED', 'true') || '')
        .trim()
        .toLowerCase() !== 'false';
    },
  },

  /**
   * Org-scoped EAS preview builds: API dispatches GitHub Actions, which runs
   * `eas build` and POSTs results to `/api/internal/eas-build-webhook`.
   */
  easOrgBuild: {
    /** Fine-grained PAT or classic token with `actions:write` on the repo */
    githubToken: optional('GITHUB_TOKEN', '').trim(),
    /** `owner/repo` for the Dilivygo monorepo */
    githubRepo: optional('GITHUB_REPO', '').trim(),
    /** Workflow file under `.github/workflows/` (default below) */
    githubWorkflowFile: optional('GITHUB_WORKFLOW_EAS_ORG_PREVIEW', 'eas-org-preview-build.yml').trim(),
    /** Git ref passed to workflow_dispatch (branch or tag) */
    githubDispatchRef: optional('GITHUB_DEFAULT_REF', 'main').trim(),
    /** Shared secret: server validates webhook; same value in GH secret `EAS_BUILD_WEBHOOK_SECRET` */
    webhookSecret: optional('EAS_BUILD_WEBHOOK_SECRET', '').trim(),
  },

  /**
   * Derive the canonical public server URL for a request from its verified
   * host context (attached by `secureHostResolution` middleware in Phase 05).
   *
   * Priority:
   *   1. Dev: `http://localhost:8080` (or `PUBLIC_SERVER_URL` if set)
   *   2. Verified custom/tenant host: `https://<hostname>`
   *   3. Staff surface (vendor/pos/superadmin): `config.appUrls.<surface>`
   *   4. Fallback: `config.publicServerUrl`
   *
   * This ensures redirects, email links, CORS, and Stripe callbacks use the
   * tenant's own verified domain rather than a hardcoded platform URL.
   */
  getPublicServerUrl(req) {
    if (!req) return config.publicServerUrl || '';
    const ctx = req.hostContext;
    if (!ctx) return config.publicServerUrl || '';

    // Dev: explicit override or localhost default.
    if (ctx.classification === 'dev') {
      return config.publicServerUrl || 'http://localhost:8080';
    }

    // Verified custom/tenant host: derive HTTPS URL from it.
    if (ctx.host && ctx.host !== 'localhost') {
      return `https://${ctx.host}`;
    }

    // Staff surface: use the configured app URL for this surface.
    if (ctx.surface && ctx.surface !== 'customer' && ctx.surface !== 'rider') {
      const override = config.appUrls?.[ctx.surface];
      if (override) return String(override).replace(/\/$/, '');
    }

    // Customer-facing org host: the host itself IS the origin.
    if (ctx.host) {
      return `https://${ctx.host}`;
    }

    return config.publicServerUrl || '';
  },
};

module.exports = config;
