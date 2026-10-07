'use strict';

/**
 * Default values for organization_platform_settings when a key is missing.
 * Tenant-facing config no longer falls back to platform_settings (org-first model).
 * Values are strings matching historical platform_settings storage.
 */
const TENANT_SETTING_DEFAULTS = {
  platform_branding: JSON.stringify({}),
  platform_theme: JSON.stringify({ light: {}, dark: {} }),
  default_currency: 'gbp',
  business_country_code: '',
  stripe_publishable_key: '',
  rider_commission_bps: '0',
  rider_delivery_fee_bps: '10000',
  map_settings: JSON.stringify({
    tilePreset: 'osm',
    customTileUrl: null,
    darkTilePreset: null,
    customDarkTileUrl: null,
    riderMarkerColor: '#2563EB',
    shopMarkerColor: '#F59E0B',
    customerMarkerColor: '#10B981',
    showZoomControls: true,
    showAttribution: true,
    defaultZoom: 14,
  }),
  delivery_fee_config: JSON.stringify({
    type: 'flat',
    flatFeeCents: 250,
    freeDeliveryThresholdCents: 0,
    tiers: [],
  }),
  default_language: 'en',
  language_locked: 'false',
  customer_profile_photo_enabled: 'true',
  multi_shop_cart_enabled: 'false',
  customer_cutlery_enabled: 'true',
  customer_refund_requests_enabled: 'true',
  customer_wallet_enabled: 'false',
  browse_category_presets: '[]',
  dietary_tag_presets: '[]',
  vendor_commission_model: 'workspace_default',
  vendor_connect_payouts_enabled: 'false',
  theme_version: '0',
  cx_enabled: 'false',
  cx_surveys_enabled: 'true',
  cx_recovery_enabled: 'true',
  cx_reputation_enabled: 'false',
  cx_automation_enabled: 'false',
  cx_ai_enabled: 'false',
  cx_attribution_window_days: '30',
  cx_anomaly_enabled: 'true',
  cx_anomaly_window_hours: '24',
  cx_anomaly_baseline_days: '7',
  cx_anomaly_min_sample: '10',
  cx_anomaly_min_baseline_sample: '30',
  cx_anomaly_multiplier: '2',
  cx_anomaly_min_delta_pp: '10',
  cx_anomaly_min_count_delta: '5',
  cx_anomaly_cooldown_hours: '24',
  cx_funnel_enabled: 'true',
  cx_funnel_cap_days: '30',
  cx_funnel_max_per_customer: '1',
  cx_whatsapp_enabled: 'true',
  // CX packaging (Phase 30): existing orgs are explicitly seeded to
  // intelligence by migration 135 so upgrades preserve access. A genuinely
  // missing setting (including a newly-created org) defaults to starter so a
  // settings gap cannot silently grant paid capabilities.
  cx_package: 'starter',
  // Per-capability overrides (Phase 30). Empty string = unset → the
  // `cx_package` preset applies. Must stay in TENANT_SETTING_KEYS so
  // platformSettings.get/getBulk resolve them per organization.
  cx_cap_recovery: '',
  cx_cap_reputation: '',
  cx_cap_funnel: '',
  cx_cap_whatsapp: '',
  cx_cap_pos: '',
  cx_cap_anomaly: '',
  cx_cap_webhooks: '',
  cx_cap_customer360: '',
  cx_cap_ai: '',
  cx_cap_competitors: '',
  cx_cap_automation: '',
};

/** Keys stored per organization only (never read from platform_settings for tenant paths). */
const TENANT_SETTING_KEYS = new Set(Object.keys(TENANT_SETTING_DEFAULTS));

/** Deployment-wide keys that remain in platform_settings. */
const GLOBAL_SETTING_KEYS = new Set(['demo_mode']);

function defaultForKey(key) {
  if (Object.prototype.hasOwnProperty.call(TENANT_SETTING_DEFAULTS, key)) {
    return TENANT_SETTING_DEFAULTS[key];
  }
  return null;
}

module.exports = {
  TENANT_SETTING_DEFAULTS,
  TENANT_SETTING_KEYS,
  GLOBAL_SETTING_KEYS,
  defaultForKey,
};
