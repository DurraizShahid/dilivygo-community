'use strict';

const vendorSettingsModel = require('../models/vendor-settings.model');
const platformSettings = require('../models/platform-settings.model');
const { mapVendorSettings } = require('../lib/case');
const { allowedDietaryTagSet } = require('../lib/dietary-tags');

async function getSettings(req, res, next) {
  try {
    if (!req.shopId) {
      return res.status(400).json({ error: 'Shop ID is required' });
    }
    const row = await vendorSettingsModel.findByShopId(req.shopId);
    return res.json({ settings: row ? mapVendorSettings(row) : null });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const data = {};
    if (req.body.autoAccept !== undefined) data.auto_accept = req.body.autoAccept;
    if (req.body.defaultPrepTimeMinutes !== undefined) data.default_prep_time_minutes = req.body.defaultPrepTimeMinutes;
    if (req.body.deliveryMode !== undefined) data.delivery_mode = req.body.deliveryMode;
    if (req.body.autoDispatchDelayMinutes !== undefined) data.auto_dispatch_delay_minutes = req.body.autoDispatchDelayMinutes;
    if (req.body.minimumOrderCents !== undefined) data.minimum_order_cents = req.body.minimumOrderCents;
    if (req.body.cutleryOffered !== undefined) data.cutlery_offered = Boolean(req.body.cutleryOffered);
    if (req.body.cutleryFeeCents !== undefined) data.cutlery_fee_cents = req.body.cutleryFeeCents;
    if (req.body.customDietaryTags !== undefined) {
      const platformRaw = await platformSettings.get('dietary_tag_presets', { projectRef: req.projectRef });
      const coreAndPlatform = allowedDietaryTagSet([], [], platformRaw);
      for (const row of req.body.customDietaryTags) {
        const c = String(row.code || '').toLowerCase().trim();
        if (c && coreAndPlatform.has(c)) {
          return res.status(400).json({
            error: `Tag code "${c}" is already a platform built-in or additional preset. Use that preset on products instead of creating a duplicate shop tag.`,
          });
        }
      }
      data.custom_dietary_tags = req.body.customDietaryTags;
    }

    if (!req.shopId) {
      return res.status(400).json({ error: 'Shop ID is required' });
    }
    const settings = await vendorSettingsModel.upsertByShopId(req.shopId, req.projectRef, data);
    const raw = Array.isArray(settings) ? settings[0] : settings;
    return res.json({ settings: mapVendorSettings(raw) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
