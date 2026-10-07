'use strict';

/**
 * Zod validators for the Blink order-channel pack — SCAFFOLD / BLOCKED.
 *
 * Status: `requires_provider_contract` (see
 * `docs/integrations/providers/blink-co.md`).
 *
 * Scope is deliberately CONFIG SHAPE ONLY:
 * - environment (sandbox | production)
 * - baseUrl allowlist of the TWO kit-documented hosts ONLY
 *   (`https://api.blinkco.io` production, `https://stg-api.blinkco.io`
 *   sandbox), each marked NEEDS-REVERIFY against live docs.blinkco.io.
 *   Environment/host consistency is enforced: sandbox configs must use the
 *   `stg-` host and production configs the prod host.
 * - branch mappings (external branch id -> Dilivygo shop UUID; may start
 *   EMPTY — mapping is completed per tenant, and sync/ingest refuse until the
 *   target branch is mapped)
 * - sync toggles (menu import / stock sync / order ingest independently
 *   switchable so partial enablement is explicit)
 * - optional Dilivygo-side webhook receiver URL (HTTPS-only, same rule as
 *   `validators/integrations.validator.js` automation webhooks)
 * - timeout / retry bounds (Dilivygo-side only, not provider-documented)
 *
 * What is INTENTIONALLY ABSENT (do not add without a cited official source):
 * - Blink username / password / bearer-token fields. The pack confirms Blink
 *   issues credentials exchanged for a bearer token, but formats, token TTL,
 *   and refresh rules are unverified — `.strict()` rejects any such key
 *   loudly instead of silently accepting an invented credential shape.
 * - Webhook signing-secret fields (header/signature scheme unverified).
 * - Any other host, path, or "API version" value (nothing else documented).
 *
 * Style mirrors `validators/keenu.validator.js` (CJS, `.strict()`).
 */

const { z } = require('zod');

const BLINK_ENVIRONMENTS = ['sandbox', 'production'];

/**
 * Kit-documented hosts ONLY (research notes §Blink). NEEDS-REVERIFY against
 * live docs.blinkco.io at implementation time. These are a CONFIG allowlist —
 * nothing in this phase calls them (no fetch to providers anywhere).
 */
const BLINK_DOCUMENTED_HOSTS = Object.freeze([
  'https://api.blinkco.io',
  'https://stg-api.blinkco.io',
]);

const BLINK_ENVIRONMENT_HOST = Object.freeze({
  sandbox: 'https://stg-api.blinkco.io',
  production: 'https://api.blinkco.io',
});

const uuidField = z
  .string()
  .trim()
  .min(1, 'shopId is required')
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'shopId must be a UUID',
  );

const branchMappingSchema = z.object({
  externalBranchId: z.string().trim().min(1, 'externalBranchId is required').max(200),
  shopId: uuidField,
}).strict();

const syncTogglesSchema = z.object({
  menuImport: z.boolean().optional().default(true),
  stockSync: z.boolean().optional().default(true),
  orderIngest: z.boolean().optional().default(true),
}).strict();

const webhookUrlField = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .superRefine((value, ctx) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'webhookUrl must be a valid absolute URL' });
      return;
    }
    const isProduction = process.env.NODE_ENV === 'production';
    if (url.protocol !== 'https:' && (isProduction || url.protocol !== 'http:')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'webhookUrl must use HTTPS' });
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'webhookUrl must not contain embedded credentials' });
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'webhookUrl cannot target a local/private host' });
    }
  });

const timeoutMsField = z.number().int().min(1000).max(30000);
const maxRetriesField = z.number().int().min(0).max(5);

/**
 * Blink channel config shape. Strict: unknown keys (especially invented
 * credential fields such as username/password/apiKey/signingSecret) fail
 * loudly instead of being silently accepted.
 */
const blinkChannelConfigSchema = z.object({
  environment: z.string().trim().toLowerCase().pipe(z.enum(BLINK_ENVIRONMENTS)),
  baseUrl: z.string().trim().max(2048),
  branchMappings: z.array(branchMappingSchema).max(500).optional().default([]),
  sync: syncTogglesSchema.optional().default({}),
  webhookUrl: webhookUrlField.optional(),
  timeoutMs: timeoutMsField.optional().default(10000),
  maxRetries: maxRetriesField.optional().default(2),
})
  .strict()
  .superRefine((value, ctx) => {
    if (!BLINK_DOCUMENTED_HOSTS.includes(value.baseUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `baseUrl must be one of the documented Blink hosts (${BLINK_DOCUMENTED_HOSTS.join(', ')}) — NEEDS-REVERIFY against live docs`,
        path: ['baseUrl'],
      });
      return;
    }
    const expected = BLINK_ENVIRONMENT_HOST[value.environment];
    if (value.baseUrl !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `environment '${value.environment}' must use ${expected}`,
        path: ['baseUrl'],
      });
    }
  });

module.exports = {
  BLINK_ENVIRONMENTS,
  BLINK_DOCUMENTED_HOSTS,
  BLINK_ENVIRONMENT_HOST,
  blinkChannelConfigSchema,
};
