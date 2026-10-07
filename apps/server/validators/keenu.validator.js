'use strict';

/**
 * Zod validators for the Keenu provider pack — SCAFFOLD / BLOCKED.
 *
 * Status: `missing` / `requires_provider_contract` (see
 * `integrations/status.json` and `docs/integrations/providers/keenu.md`).
 *
 * Scope is deliberately CONFIG SHAPE ONLY:
 * - environment (sandbox | production)
 * - merchant identifier label (see provisional note below)
 * - HTTPS callback URL (same HTTPS-only rule as
 *   `validators/integrations.validator.js` automation webhooks)
 * - currency allowlist (PKR only — see note below)
 * - timeout / retry bounds
 *
 * What is PROVISIONAL (pending official merchant docs, provider doc §3):
 * - `merchantId`: the FIELD ITSELF is provisional. No verified merchant-ID,
 *   API-key, or secret format exists, so this schema accepts only an opaque
 *   non-empty label and MUST NOT be read as a verified credential format.
 * - `callbackUrl`: shape-validated only; the real callback/webhook contract
 *   (redirect vs server-to-server, signing, retries) is unverified.
 * - `timeoutMs` / `maxRetries`: Dilivygo-side bounds only, not provider docs.
 *
 * What is INTENTIONALLY ABSENT (do not add without a cited official source):
 * - API keys, signing secrets, OAuth client ids/secrets, token fields.
 * - Any currency beyond PKR: kit research confirms a Pakistan EMI scope and
 *   cites no source for AED/SAR or other currencies — keep PKR-only until
 *   official docs say otherwise.
 * - Sandbox/prod base URLs: none verified — no URL field beyond callbackUrl.
 *
 * Style mirrors `validators/integrations.validator.js` (CJS, `.strict()`,
 * shared error contract via `validate()` middleware when this is wired).
 */

const { z } = require('zod');

const KEENU_ENVIRONMENTS = ['sandbox', 'production'];

/**
 * PKR only. Rationale: Keenu is a Pakistan (SBP-regulated EMI) regional
 * provider per its official site; no citable source in the kit research
 * supports AED/SAR or any other currency for Keenu merchant payments.
 */
const KEENU_CURRENCIES = ['PKR'];

/** Merchant identifier — PROVISIONAL opaque label, not a verified format. */
const merchantIdField = z
  .string()
  .trim()
  .min(1, 'merchantId is required')
  .max(200, 'merchantId is too long');

/**
 * HTTPS-only callback URL. Mirrors the synchronous prefix of
 * `assertPublicWebhookUrl` in `services/integration-webhook.service.js`:
 * absolute URL, HTTPS in production (HTTP tolerated off-production like the
 * service), no embedded credentials, no localhost host. DNS/SSRF checks stay
 * service-side when the live handler is built.
 */
const callbackUrlField = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .superRefine((value, ctx) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'callbackUrl must be a valid absolute URL' });
      return;
    }
    const isProduction = process.env.NODE_ENV === 'production';
    if (url.protocol !== 'https:' && (isProduction || url.protocol !== 'http:')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'callbackUrl must use HTTPS' });
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'callbackUrl must not contain embedded credentials' });
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'callbackUrl cannot target a local/private host' });
    }
  });

/** Dilivygo-side bounds only (not provider-documented values). */
const timeoutMsField = z.number().int().min(1000).max(30000);
const maxRetriesField = z.number().int().min(0).max(5);

/**
 * Keenu connection config shape. Strict: unknown keys (especially invented
 * credential fields) fail loudly instead of being silently accepted.
 */
const keenuConfigSchema = z.object({
  environment: z.string().trim().toLowerCase().pipe(z.enum(KEENU_ENVIRONMENTS)),
  merchantId: merchantIdField,
  callbackUrl: callbackUrlField,
  currency: z.string().trim().toUpperCase().pipe(z.enum(KEENU_CURRENCIES)),
  timeoutMs: timeoutMsField.optional().default(10000),
  maxRetries: maxRetriesField.optional().default(2),
}).strict();

module.exports = {
  KEENU_ENVIRONMENTS,
  KEENU_CURRENCIES,
  keenuConfigSchema,
};
