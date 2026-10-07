'use strict';

const vendorSettingsModel = require('../models/vendor-settings.model');
const {
  isCustomerCutleryPlatformEnabled,
  resolveCutleryFromSettings,
  assertCutleryRequestAllowed,
  parseWantsCutlery,
} = require('../lib/checkout-cutlery');
const { createTrustedCutlerySnapshot } = require('../lib/trusted-checkout-snapshot');

/**
 * Replace checkoutDraft cutlery flags with a server-validated fee snapshot after
 * request validation but before PaymentIntent creation. The snapshot survives
 * durable checkout-batch serialization; its non-serializable trust marker is
 * reattached only when the server reloads that batch for fulfillment.
 */
async function snapshotCheckoutCutlery(req, _res, next) {
  try {
    const groups = req.body?.checkoutDraft?.groups;
    if (!Array.isArray(groups) || groups.length === 0) return next();

    for (const group of groups) {
      if (!group?.shopId) continue;
      const requestedByClient = parseWantsCutlery(group.wantsCutlery);
      // At this boundary the input is ordinary validated JSON. Never accept a
      // pre-shaped object as trusted; Boolean objects are rejected by the
      // request validator before this middleware executes.
      const wants = requestedByClient === true;
      const vendorSettings = await vendorSettingsModel.findByShopId(group.shopId);
      const settingsCtx = group.projectRef ? { projectRef: String(group.projectRef) } : undefined;
      const platformEnabled = await isCustomerCutleryPlatformEnabled(settingsCtx);
      assertCutleryRequestAllowed(wants, vendorSettings, platformEnabled);
      const resolved = resolveCutleryFromSettings({
        platformEnabled,
        vendorSettings,
        wantsCutlery: wants,
      });
      group.wantsCutlery = createTrustedCutlerySnapshot(resolved);
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { snapshotCheckoutCutlery };
