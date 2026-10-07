'use strict';

/**
 * Zod validators for the ePOSmatic order-channel pack — SCAFFOLD / BLOCKED.
 *
 * Status: `requires_provider_contract` (see
 * `docs/integrations/providers/eposmatic.md`).
 *
 * Scope is deliberately CONFIG SHAPE ONLY:
 * - environment (sandbox | production)
 * - sourceOfTruth: ONE authoritative side per entity (`menu | price | stock |
 *   orderStatus`, each `'dilivygo' | 'provider'`). This is the config half of
 *   the bidirectional-loop prevention enforced at runtime by
 *   `services/eposmatic-channel.scaffold.js` (`assertWriteDirection`): the
 *   same enum vocabulary is used in both places so config and runtime can
 *   never disagree. Defaults mirror the scaffold (`menu/price/stock =
 *   provider`, `orderStatus = dilivygo`).
 * - branch mappings (external branch id -> Dilivygo shop UUID; may start
 *   EMPTY — sync/ingest refuse until the target branch is mapped)
 * - sync toggles (menu / stock / order ingest / order export / reconciliation
 *   independently switchable so each direction is explicitly enabled)
 * - timeout / retry bounds (Dilivygo-side only, not provider-documented)
 *
 * What is INTENTIONALLY ABSENT (do not add without a cited official source):
 * - ANY baseUrl/host field — no ePOSmatic API host is verified at all
 *   (transport is "TBD with the partner team"). A host field must not exist
 *   until the official partner docs name one.
 * - ANY auth/credential field (auth scheme unverified — rejected by
 *   `.strict()`).
 * - Webhook signing-secret fields (verification scheme unverified).
 *
 * Style mirrors `validators/keenu.validator.js` (CJS, `.strict()`).
 */

const { z } = require('zod');

const EPOSMATIC_ENVIRONMENTS = ['sandbox', 'production'];
const EPOSMATIC_TRUTH_SIDES = ['dilivygo', 'provider'];

const sourceOfTruthSchema = z.object({
  menu: z.string().trim().toLowerCase().pipe(z.enum(EPOSMATIC_TRUTH_SIDES)).optional().default('provider'),
  price: z.string().trim().toLowerCase().pipe(z.enum(EPOSMATIC_TRUTH_SIDES)).optional().default('provider'),
  stock: z.string().trim().toLowerCase().pipe(z.enum(EPOSMATIC_TRUTH_SIDES)).optional().default('provider'),
  orderStatus: z.string().trim().toLowerCase().pipe(z.enum(EPOSMATIC_TRUTH_SIDES)).optional().default('dilivygo'),
}).strict();

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
  orderExport: z.boolean().optional().default(false),
  reconciliation: z.boolean().optional().default(true),
}).strict();

const timeoutMsField = z.number().int().min(1000).max(30000);
const maxRetriesField = z.number().int().min(0).max(5);

/**
 * ePOSmatic channel config shape. Strict: unknown keys (especially invented
 * host/auth fields such as baseUrl/apiKey/username/signingSecret) fail loudly
 * instead of being silently accepted.
 */
const eposmaticChannelConfigSchema = z.object({
  environment: z.string().trim().toLowerCase().pipe(z.enum(EPOSMATIC_ENVIRONMENTS)),
  sourceOfTruth: sourceOfTruthSchema.optional().default({}),
  branchMappings: z.array(branchMappingSchema).max(500).optional().default([]),
  sync: syncTogglesSchema.optional().default({}),
  timeoutMs: timeoutMsField.optional().default(10000),
  maxRetries: maxRetriesField.optional().default(2),
}).strict();

module.exports = {
  EPOSMATIC_ENVIRONMENTS,
  EPOSMATIC_TRUTH_SIDES,
  eposmaticChannelConfigSchema,
};
