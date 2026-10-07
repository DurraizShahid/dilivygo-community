'use strict';

const shopModel = require('../models/shop.model');
const { select } = require('../lib/supabase');
const {
  getPlatformCurrency,
  resolveShopCurrency,
  validCurrency,
} = require('../lib/currency');

/**
 * Currency is configuration, not customer input.
 *
 * The UI may send its currently hydrated currency so we can detect a stale
 * client, but the server always resolves the authoritative value from the
 * checkout's shops/workspaces/organization. This prevents a client from
 * charging an order in a different currency than the rest of the tenant.
 */
async function enforceAuthoritativeCurrency(req, _res, next) {
  try {
    const requestedCurrency = validCurrency(req.body?.currency);
    const groups = Array.isArray(req.body?.checkoutDraft?.groups)
      ? req.body.checkoutDraft.groups
      : [];

    let authoritativeCurrency = null;

    if (groups.length) {
      const currencies = new Set();

      for (const group of groups) {
        if (!group?.shopId) continue;
        const shop = await shopModel.findById(group.shopId);
        if (!shop) continue; // existing checkout validation returns the canonical 404 later

        const workspaceRows = shop.project_ref
          ? await select('workspaces', {
              filters: { project_ref: shop.project_ref },
              limit: 1,
            })
          : [];
        const workspace = workspaceRows?.[0] || null;
        currencies.add(await resolveShopCurrency(shop, workspace));
      }

      if (currencies.size > 1) {
        const err = new Error(
          'Checkout cannot mix shops that use different currencies. Start a separate order for each currency.',
        );
        err.statusCode = 400;
        err.code = 'MIXED_CURRENCY_CART';
        throw err;
      }

      authoritativeCurrency = [...currencies][0] || null;
    }

    if (!authoritativeCurrency) {
      const settingsCtx = req.organizationId
        ? { organizationId: req.organizationId }
        : req.projectRef
          ? { projectRef: req.projectRef }
          : undefined;
      authoritativeCurrency = await getPlatformCurrency(settingsCtx);
    }

    if (requestedCurrency && requestedCurrency !== authoritativeCurrency) {
      const err = new Error(
        `Currency changed to ${authoritativeCurrency.toUpperCase()}. Refresh pricing and try checkout again.`,
      );
      err.statusCode = 409;
      err.code = 'CURRENCY_MISMATCH';
      err.details = {
        requestedCurrency: requestedCurrency.toUpperCase(),
        authoritativeCurrency: authoritativeCurrency.toUpperCase(),
      };
      throw err;
    }

    req.body.currency = authoritativeCurrency;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { enforceAuthoritativeCurrency };
