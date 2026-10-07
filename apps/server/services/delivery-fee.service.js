'use strict';

const platformSettings = require('../models/platform-settings.model');

const DEFAULT_FEE_CENTS = 250;

function parseDeliveryFeeConfig(raw) {
  if (!raw) return null;
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function nonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Mirrors the shared customer UI calculation, but is authoritative. */
function computeDeliveryFee(config, subtotalCents) {
  const subtotal = nonNegativeInt(subtotalCents, 0);
  if (!config) return DEFAULT_FEE_CENTS;

  const freeThreshold = nonNegativeInt(config.freeDeliveryThresholdCents, 0);
  if (freeThreshold > 0 && subtotal >= freeThreshold) return 0;

  if (config.type === 'tiered' && Array.isArray(config.tiers) && config.tiers.length) {
    for (const tier of config.tiers) {
      if (!tier || typeof tier !== 'object') continue;
      const limit = tier.upToCents == null ? null : nonNegativeInt(tier.upToCents, 0);
      if (limit == null || subtotal <= limit) {
        return nonNegativeInt(tier.feeCents, DEFAULT_FEE_CENTS);
      }
    }
    const last = config.tiers[config.tiers.length - 1];
    return nonNegativeInt(last?.feeCents, DEFAULT_FEE_CENTS);
  }

  return nonNegativeInt(config.flatFeeCents, DEFAULT_FEE_CENTS);
}

async function getAuthoritativeDeliveryFee({ subtotalCents, projectRef, organizationId }) {
  const raw = await platformSettings.get(
    'delivery_fee_config',
    organizationId
      ? { organizationId: String(organizationId) }
      : projectRef
        ? { projectRef: String(projectRef) }
        : undefined,
  );
  return computeDeliveryFee(parseDeliveryFeeConfig(raw), subtotalCents);
}

module.exports = {
  DEFAULT_FEE_CENTS,
  parseDeliveryFeeConfig,
  computeDeliveryFee,
  getAuthoritativeDeliveryFee,
};
