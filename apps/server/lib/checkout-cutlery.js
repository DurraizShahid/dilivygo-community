'use strict';

const platformSettings = require('../models/platform-settings.model');
const vendorSettingsModel = require('../models/vendor-settings.model');
const { isTrustedCutlerySnapshot } = require('./trusted-checkout-snapshot');

async function isCustomerCutleryPlatformEnabled(options) {
  const raw = await platformSettings.get('customer_cutlery_enabled', options);
  return raw !== 'false';
}

/**
 * @param {{ platformEnabled: boolean; vendorSettings: object | null; wantsCutlery: boolean | object }} opts
 * @returns {{ requested: boolean; feeCents: number }}
 */
function resolveCutleryFromSettings({ platformEnabled, vendorSettings, wantsCutlery }) {
  if (isTrustedCutlerySnapshot(wantsCutlery)) {
    return {
      requested: wantsCutlery.requested,
      feeCents: wantsCutlery.feeCents,
    };
  }

  if (!platformEnabled || !wantsCutlery || !vendorSettings?.cutlery_offered) {
    return { requested: false, feeCents: 0 };
  }
  const fee = Math.max(0, Number(vendorSettings.cutlery_fee_cents ?? 0));
  return { requested: true, feeCents: Number.isFinite(fee) ? fee : 0 };
}

async function resolveCutleryForShop(shopId, wantsCutlery) {
  if (!shopId) {
    const platformEnabled = await isCustomerCutleryPlatformEnabled();
    return { requested: false, feeCents: 0, platformEnabled, vendorSettings: null };
  }
  const vendorSettings = await vendorSettingsModel.findByShopId(shopId);
  const projectRef = vendorSettings?.project_ref ? String(vendorSettings.project_ref) : null;
  const settingsOpts = projectRef ? { projectRef } : undefined;
  const platformEnabled = await isCustomerCutleryPlatformEnabled(settingsOpts);
  const { requested, feeCents } = resolveCutleryFromSettings({
    platformEnabled,
    vendorSettings,
    wantsCutlery: Boolean(wantsCutlery),
  });
  return { requested, feeCents, platformEnabled, vendorSettings };
}

/**
 * Customer asked for cutlery but shop/platform disallows → 400.
 * A trusted snapshot was already validated before charge, so live settings must
 * not invalidate that paid promise during webhook fulfillment.
 */
function assertCutleryRequestAllowed(wantsCutlery, vendorSettings, platformEnabled) {
  if (isTrustedCutlerySnapshot(wantsCutlery)) return;
  if (!wantsCutlery) return;
  if (!platformEnabled) return;
  if (!vendorSettings?.cutlery_offered) {
    const err = new Error('This shop does not offer cutlery at checkout.');
    err.statusCode = 400;
    throw err;
  }
}

function parseWantsCutlery(value) {
  if (isTrustedCutlerySnapshot(value)) return value;
  if (value === true) return true;
  if (value === false || value == null) return false;
  const s = String(value).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

module.exports = {
  isCustomerCutleryPlatformEnabled,
  resolveCutleryFromSettings,
  resolveCutleryForShop,
  assertCutleryRequestAllowed,
  parseWantsCutlery,
};
