'use strict';

const { BRANDING_KEYS } = require('./platform-branding');
const { normalizePlatformThemeBody } = require('./platform-theme');
const {
  updateMapSettingsSchema,
  updateDeliveryFeeConfigSchema,
  themeColorsPartialSchema,
} = require('../validators/theme.validator');
const { validCurrency } = require('./currency');

const MARKETPLACE_REFS = new Set(['_marketplace', '__platform__']);

/** Aligns with superadmin `DELIVERY_FEE_DEFAULTS` when normalizing overlay delivery fees. */
const DELIVERY_FEE_DEFAULTS = {
  type: 'flat',
  flatFeeCents: 250,
  freeDeliveryThresholdCents: 0,
  tiers: [],
};

/**
 * @param {string|null|undefined} ref
 * @returns {string|null} safe project_ref for DB lookup, or null when overlay must not apply
 */
function safeProjectRefForThemeOverlay(ref) {
  const s = String(ref ?? '').trim();
  if (!s || MARKETPLACE_REFS.has(s)) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) return null;
  return s;
}

/**
 * Shallow merge map-like objects (public map_settings shape).
 * @param {unknown} base
 * @param {unknown} overlay
 * @returns {Record<string, unknown>|undefined}
 */
function mergeMapSettingsLayer(base, overlay) {
  if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) {
    return base && typeof base === 'object' ? base : undefined;
  }
  const b = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(overlay)) {
    if (v === undefined) continue;
    b[k] = v;
  }
  return b;
}

/**
 * @param {unknown} o
 * @returns {boolean}
 */
function isNonEmptyPlainObject(o) {
  return Boolean(o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length > 0);
}

/**
 * Merge tenant overlay into the resolved public theme payload (read path).
 * @param {Record<string, unknown>} base - object returned to clients (camelCase theme keys)
 * @param {{ currency?: string|null, public_theme_overlay?: unknown }|null|undefined} workspace
 * @returns {Record<string, unknown>}
 */
function mergeOverlayIntoResolvedPublicTheme(base, workspace) {
  if (!workspace) return base;
  const out = { ...base };

  const cur = validCurrency(workspace.currency);
  if (cur) {
    out.currencyCode = cur;
  }

  let overlay = workspace.public_theme_overlay;
  if (overlay == null || overlay === '') return out;
  if (typeof overlay === 'string') {
    try {
      overlay = JSON.parse(overlay);
    } catch {
      return out;
    }
  }
  if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) return out;

  for (const k of BRANDING_KEYS) {
    if (overlay[k] != null && String(overlay[k]).trim() !== '') {
      out[k] = String(overlay[k]).trim();
    }
  }

  const frag = normalizePlatformThemeBody({
    light: overlay.light && typeof overlay.light === 'object' ? overlay.light : {},
    dark: overlay.dark && typeof overlay.dark === 'object' ? overlay.dark : {},
  });
  if (Object.keys(frag.light).length) {
    out.light = { ...(typeof out.light === 'object' && out.light ? out.light : {}), ...frag.light };
  }
  if (Object.keys(frag.dark).length) {
    out.dark = { ...(typeof out.dark === 'object' && out.dark ? out.dark : {}), ...frag.dark };
  }

  if (isNonEmptyPlainObject(overlay.mapSettings)) {
    const pr = updateMapSettingsSchema.partial().safeParse(overlay.mapSettings);
    if (pr.success && isNonEmptyPlainObject(pr.data)) {
      const merged = mergeMapSettingsLayer(out.mapSettings, pr.data);
      if (merged && Object.keys(merged).length) out.mapSettings = merged;
    }
  }

  if (isNonEmptyPlainObject(overlay.deliveryFeeConfig)) {
    const pr = updateDeliveryFeeConfigSchema.safeParse(overlay.deliveryFeeConfig);
    if (pr.success && isNonEmptyPlainObject(pr.data)) {
      out.deliveryFeeConfig = { ...DELIVERY_FEE_DEFAULTS, ...pr.data };
    }
  }

  return out;
}

/**
 * Merge validated PATCH body into existing stored overlay (write path).
 * `null` on a key clears that override from storage where supported.
 * @param {Record<string, unknown>|null|undefined} existing
 * @param {Record<string, unknown>} patch
 * @returns {Record<string, unknown>}
 */
function mergePublicThemeOverlayPatch(existing, patch) {
  const ex =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};

  for (const k of BRANDING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
    const v = patch[k];
    if (v == null || v === '') delete ex[k];
    else ex[k] = String(v).trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'light')) {
    const v = patch.light;
    if (v == null) delete ex.light;
    else if (v && typeof v === 'object') {
      const parsed = themeColorsPartialSchema.safeParse(v);
      if (!parsed.success) {
        /* PATCH body should be pre-validated; skip bad fragments */
      } else {
      const prev = ex.light && typeof ex.light === 'object' ? { ...ex.light } : {};
      for (const [ck, val] of Object.entries(parsed.data)) {
        if (val == null || val === '') delete prev[ck];
        else prev[ck] = String(val).trim();
      }
      if (Object.keys(prev).length === 0) delete ex.light;
      else ex.light = prev;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'dark')) {
    const v = patch.dark;
    if (v == null) delete ex.dark;
    else if (v && typeof v === 'object') {
      const parsed = themeColorsPartialSchema.safeParse(v);
      if (!parsed.success) {
        /* skip */
      } else {
      const prev = ex.dark && typeof ex.dark === 'object' ? { ...ex.dark } : {};
      for (const [ck, val] of Object.entries(parsed.data)) {
        if (val == null || val === '') delete prev[ck];
        else prev[ck] = String(val).trim();
      }
      if (Object.keys(prev).length === 0) delete ex.dark;
      else ex.dark = prev;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'mapSettings')) {
    const v = patch.mapSettings;
    if (v == null) delete ex.mapSettings;
    else if (typeof v === 'object' && !Array.isArray(v)) {
      const pr = updateMapSettingsSchema.partial().safeParse(v);
      if (!pr.success) {
        /* skip */
      } else {
      const prev = ex.mapSettings && typeof ex.mapSettings === 'object' ? ex.mapSettings : {};
      ex.mapSettings = mergeMapSettingsLayer(prev, pr.data);
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'deliveryFeeConfig')) {
    const v = patch.deliveryFeeConfig;
    if (v == null) delete ex.deliveryFeeConfig;
    else if (typeof v === 'object' && !Array.isArray(v)) {
      const pr = updateDeliveryFeeConfigSchema.safeParse(v);
      if (pr.success && isNonEmptyPlainObject(pr.data)) {
        ex.deliveryFeeConfig = { ...DELIVERY_FEE_DEFAULTS, ...pr.data };
      }
    }
  }

  return ex;
}

/**
 * Compute sparse overlay that makes `base` resolve to `desired` via mergeOverlayIntoResolvedPublicTheme.
 * - Only keys where desired differs from base (after normalization) are included.
 * - Equivalent colors (case, 3-digit, oklch vs hex that resolve same) are considered equal and not stored.
 * - `null` semantics: if desired has null/empty for a key that base has, the overlay will have null to clear.
 * - Preserves non-color branding keys from desired where they differ.
 * - Pure, deterministic.
 * @param {Record<string, unknown>} base - org resolved theme (light/dark etc.)
 * @param {Record<string, unknown>} desired - intended effective theme for workspace
 * @returns {Record<string, unknown>} sparse overlay
 */
function diffThemeOverlay(base, desired) {
  const out = {};
  if (!desired || typeof desired !== 'object') return out;

  const normColor = (v) => {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (!s) return null;
    // Use platform-theme helpers for normalization: expand 3-digit, lower-case, validate
    const { normalizeHexColor, isSafeCssColorValue } = require('./platform-theme');
    if (!isSafeCssColorValue(s)) return s; // keep as-is for comparison (will be filtered)
    return s.startsWith('#') ? normalizeHexColor(s).toLowerCase() : s.toLowerCase();
  };

  const equalColor = (a, b) => {
    const na = normColor(a);
    const nb = normColor(b);
    if (na == null && nb == null) return true;
    if (na == null || nb == null) return false;
    return na === nb;
  };

  // Branding keys: sparse diff
  for (const k of BRANDING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(desired, k)) continue;
    const d = desired[k];
    const bv = base ? base[k] : undefined;
    const dn = d != null && String(d).trim() !== '' ? String(d).trim() : null;
    const bn = bv != null && String(bv).trim() !== '' ? String(bv).trim() : null;
    if (dn === bn) continue; // same → inherit, no override
    if (dn == null) {
      // desired wants to clear → store null only if base had a value
      if (bn != null) out[k] = null;
    } else {
      out[k] = dn;
    }
  }

  // Theme colors: light/dark sparse
  for (const mode of ['light', 'dark']) {
    if (!Object.prototype.hasOwnProperty.call(desired, mode)) continue;
    const dMode = desired[mode];
    const bMode = base && typeof base[mode] === 'object' && base[mode] ? base[mode] : {};
    if (dMode == null) {
      // desired explicitly null → clear entire mode if base had any
      const hasBase = bMode && typeof bMode === 'object' && Object.keys(bMode).length > 0;
      if (hasBase) out[mode] = null;
      continue;
    }
    if (typeof dMode !== 'object' || Array.isArray(dMode)) continue;
    const diff = {};
    for (const ck of Object.keys(dMode)) {
      const dv = dMode[ck];
      const bv = bMode ? bMode[ck] : undefined;
      if (dv == null || dv === '') {
        // desired wants to clear this token
        if (bv != null && String(bv).trim() !== '') {
          diff[ck] = null;
        }
      } else {
        const dvNorm = normColor(dv);
        const bvNorm = bv != null ? normColor(bv) : null;
        if (dvNorm === bvNorm) continue; // equivalent → no override
        diff[ck] = String(dv).trim();
      }
    }
    if (Object.keys(diff).length > 0) out[mode] = diff;
  }

  return out;
}

module.exports = {
  safeProjectRefForThemeOverlay,
  mergeOverlayIntoResolvedPublicTheme,
  mergePublicThemeOverlayPatch,
  mergeMapSettingsLayer,
  DELIVERY_FEE_DEFAULTS,
  diffThemeOverlay,
};
