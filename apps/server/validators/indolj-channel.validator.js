'use strict';

/**
 * Zod validators for the Indolj order-channel pack — SCAFFOLD / BLOCKED.
 *
 * Status: `requires_provider_contract` (see
 * `docs/integrations/providers/indolj.md`).
 *
 * Scope is deliberately CONFIG SHAPE ONLY:
 * - environment (sandbox | production)
 * - baseUrl OPTIONAL free-form HTTPS URL, documented UNVERIFIED. The exact
 *   Indolj endpoint contract was not reliably retrievable when the kit was
 *   built, so NO host is allowlisted and NO host is asserted: any absolute
 *   HTTPS URL passes shape validation, and the value is NEVER called (no
 *   fetch to providers anywhere in this phase). Omit the field entirely when
 *   no official host is known. NEVER guess indolj domains — the schema must
 *   not contain one.
 * - branch mappings (external store id -> Dilivygo shop UUID; may start
 *   EMPTY — sync/ingest refuse until the target branch is mapped)
 * - sync toggles (menu import / stock sync / order ingest / reconciliation
 *   independently switchable; reconciliation defaults OFF until Indolj
 *   confirms query APIs — mirrors the capability flag)
 * - timeout / retry bounds (Dilivygo-side only, not provider-documented)
 *
 * What is INTENTIONALLY ABSENT (do not add without a cited official source):
 * - ANY auth/credential field (auth method unverified — apiKey, username,
 *   password, clientSecret, bearer tokens are all rejected by `.strict()`).
 * - Webhook signing-secret fields (verification scheme unverified).
 * - Rate-limit / pagination / status-code assumptions.
 *
 * Style mirrors `validators/keenu.validator.js` (CJS, `.strict()`).
 */

const { z } = require('zod');

const INDOLJ_ENVIRONMENTS = ['sandbox', 'production'];

/**
 * Optional, free-form, UNVERIFIED base URL. Shape-checked only (absolute URL,
 * HTTPS in production, no embedded credentials, no local host — same rule as
 * `validators/integrations.validator.js` automation webhooks). Presence in a
 * saved config is NOT evidence of a verified contract.
 */
const baseUrlField = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .superRefine((value, ctx) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'baseUrl must be a valid absolute URL' });
      return;
    }
    const isProduction = process.env.NODE_ENV === 'production';
    if (url.protocol !== 'https:' && (isProduction || url.protocol !== 'http:')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'baseUrl must use HTTPS' });
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'baseUrl must not contain embedded credentials' });
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'baseUrl cannot target a local/private host' });
    }
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
  reconciliation: z.boolean().optional().default(false),
}).strict();

const timeoutMsField = z.number().int().min(1000).max(30000);
const maxRetriesField = z.number().int().min(0).max(5);

/**
 * Indolj channel config shape. Strict: unknown keys (especially invented
 * auth/credential fields) fail loudly instead of being silently accepted.
 */
const indoljChannelConfigSchema = z.object({
  environment: z.string().trim().toLowerCase().pipe(z.enum(INDOLJ_ENVIRONMENTS)),
  baseUrl: baseUrlField.optional(),
  branchMappings: z.array(branchMappingSchema).max(500).optional().default([]),
  sync: syncTogglesSchema.optional().default({}),
  timeoutMs: timeoutMsField.optional().default(10000),
  maxRetries: maxRetriesField.optional().default(2),
}).strict();

module.exports = {
  INDOLJ_ENVIRONMENTS,
  indoljChannelConfigSchema,
};
