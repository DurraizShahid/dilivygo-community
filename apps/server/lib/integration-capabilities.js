'use strict';

/**
 * Capability interfaces for integrations (Phase 01).
 *
 * Business code must ask for *capabilities* (`assertCapability(providerKey,
 * 'accounting')`), never branch on provider names. The provider→capabilities
 * map is derived data-driven from `integrations/catalog.json` (same SSOT the
 * connection service builds its registry from) — there are no per-provider
 * conditionals in this module.
 *
 * Canonical capability names (`CAPABILITIES`) are the vocabulary consumers
 * may request. Catalog tags pass through verbatim (lower-cased), plus one
 * documented derivation: catalog entries tagged with both `marketplace` and
 * `orders` additionally expose the canonical `marketplace-orders` capability
 * (marketplace order-ingestion), so consumers have a single name to ask for.
 *
 * Error contract mirrors the connection service shape (`statusCode` + `code`):
 * - unknown provider → 404 `PROVIDER_NOT_CONFIGURED`
 * - known provider lacking the capability (or unknown capability name) →
 *   422 `CAPABILITY_NOT_SUPPORTED`
 */

const catalog = require('../../../integrations/catalog.json');

const CAPABILITIES = Object.freeze({
  PAYMENTS: 'payments',
  MARKETPLACE_PAYMENTS: 'marketplace-payments',
  PAYOUTS: 'payouts',
  ACCOUNTING: 'accounting',
  MARKETPLACE_ORDERS: 'marketplace-orders',
  POS: 'pos',
  CRM: 'crm',
  MARKETING: 'marketing',
  EMAIL: 'email',
  MESSAGING: 'messaging',
  SUPPORT: 'support',
  NOTIFICATIONS: 'notifications',
  COLLABORATION: 'collaboration',
  ANALYTICS: 'analytics',
  AUTOMATION: 'automation',
  PUSH_NOTIFICATIONS: 'push-notifications',
  MAPS: 'maps',
  AI: 'ai',
  BNPL: 'bnpl',
});

const KNOWN_CAPABILITY_SET = new Set(Object.values(CAPABILITIES));

function normalizeProviderKey(providerKey) {
  return String(providerKey || '').trim().toLowerCase();
}

function normalizeCapabilityName(capability) {
  return String(capability || '').trim().toLowerCase();
}

function capabilityError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function capabilitiesForCatalogEntry(item) {
  const raw = Array.isArray(item && item.capabilities) ? item.capabilities : [];
  const set = new Set(raw.map(normalizeCapabilityName).filter(Boolean));
  if (set.has('marketplace') && set.has('orders')) {
    set.add(CAPABILITIES.MARKETPLACE_ORDERS);
  }
  return Object.freeze([...set].sort());
}

/** providerKey → sorted frozen capability list, derived from the catalog. */
const PROVIDER_CAPABILITIES = Object.freeze(
  Object.fromEntries(
    (Array.isArray(catalog) ? catalog : [])
      .filter((item) => item && item.key)
      .map((item) => [
        normalizeProviderKey(item.key),
        capabilitiesForCatalogEntry(item),
      ]),
  ),
);

/** Capability list for a provider, or `null` when the provider is unknown. */
function getCapabilities(providerKey) {
  return PROVIDER_CAPABILITIES[normalizeProviderKey(providerKey)] || null;
}

/** Boolean check — never throws. Unknown providers / capabilities → `false`. */
function hasCapability(providerKey, capability) {
  const caps = getCapabilities(providerKey);
  if (!caps) return false;
  return caps.includes(normalizeCapabilityName(capability));
}

/**
 * Throwing guard for service boundaries. Returns `true` when the provider
 * offers the capability so it can be used inline (`assertCapability(...) &&
 * ...` is unnecessary — a return means success).
 */
function assertCapability(providerKey, capability) {
  const key = normalizeProviderKey(providerKey);
  const caps = PROVIDER_CAPABILITIES[key];
  if (!caps) {
    throw capabilityError(
      `Unsupported integration provider: ${String(providerKey || '').trim() || '(empty)'}`,
      404,
      'PROVIDER_NOT_CONFIGURED',
    );
  }
  const want = normalizeCapabilityName(capability);
  if (!KNOWN_CAPABILITY_SET.has(want) || !caps.includes(want)) {
    throw capabilityError(
      `Provider ${key} does not support capability ${want || '(empty)'}`,
      422,
      'CAPABILITY_NOT_SUPPORTED',
    );
  }
  return true;
}

/** Reverse lookup: every catalog provider key offering `capability`. */
function providersForCapability(capability) {
  const want = normalizeCapabilityName(capability);
  return Object.entries(PROVIDER_CAPABILITIES)
    .filter(([, caps]) => caps.includes(want))
    .map(([key]) => key)
    .sort();
}

module.exports = {
  CAPABILITIES,
  PROVIDER_CAPABILITIES,
  getCapabilities,
  hasCapability,
  assertCapability,
  providersForCapability,
};
