'use strict';

const platformSettings = require('../models/platform-settings.model');

const DEFAULT_CURRENCY = 'gbp';

/**
 * Normalize a currency code to the server's canonical lowercase ISO-4217 form.
 * This intentionally accepts only exactly three ASCII letters; Stripe and the
 * public clients should never receive arbitrary strings such as "usdollars".
 */
function validCurrency(val) {
  if (typeof val !== 'string') return null;
  const normalized = val.trim().toLowerCase();
  return /^[a-z]{3}$/.test(normalized) ? normalized : null;
}

/**
 * Default currency from tenant settings. platform-settings already owns cache
 * invalidation, including writes to organization_platform_settings. Keeping a
 * second cache here caused currency changes to remain stale for up to 60s and
 * made different apps disagree immediately after an admin changed currency.
 *
 * @param {{ projectRef?: string, organizationId?: string }} [options]
 */
async function getPlatformCurrency(options) {
  try {
    const val = await platformSettings.get('default_currency', options);
    return validCurrency(val) || DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

/**
 * Resolve the effective currency for a shop.
 * Priority: shop.currency > workspace.currency > organization setting > GBP.
 */
async function resolveShopCurrency(shop, workspace) {
  const opts = workspace?.organization_id
    ? { organizationId: workspace.organization_id }
    : workspace?.project_ref
      ? { projectRef: workspace.project_ref }
      : shop?.organization_id
        ? { organizationId: shop.organization_id }
        : shop?.project_ref
          ? { projectRef: shop.project_ref }
          : undefined;

  return (
    validCurrency(shop?.currency)
    || validCurrency(workspace?.currency)
    || (await getPlatformCurrency(opts))
  );
}

/**
 * Resolve currency synchronously when shop/workspace rows are available.
 * Falls back to a provided tenant/platform default.
 */
function resolveShopCurrencySync(shop, workspace, platformDefault) {
  return (
    validCurrency(shop?.currency)
    || validCurrency(workspace?.currency)
    || validCurrency(platformDefault)
    || DEFAULT_CURRENCY
  );
}

module.exports = {
  resolveShopCurrency,
  resolveShopCurrencySync,
  getPlatformCurrency,
  validCurrency,
  DEFAULT_CURRENCY,
};