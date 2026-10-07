'use strict';

/**
 * Shared runtime surface policy — single source of truth for preview + runtime.
 *
 * Surfaces: customer_web, rider_web, vendor_web, pos_web, saas_web,
 *           customer_mobile, vendor_mobile, rider_mobile
 *
 * Rules (mirrors apps/server/controllers/public.controller.js computeResolvedTheme):
 * - customer_web / rider_web (+ mobiles): organization theme applies normally.
 *   No logistics-shell forcing. Dark stays brand-derived.
 * - vendor_web (+ vendor_mobile): org theme + permitted workspace overlay.
 *   Dark logistics shell: fixed operational surfaces (background/secondary/muted/accent)
 *   are forced to canonical dark values for readability — identical in preview/runtime.
 * - pos_web: workspace light/dark colors stripped (POS_STRIPPED_KEYS). Only org
 *   theme + branding applies. Dark shell same fixed surfaces as vendor.
 * - saas_web: org theme applies normally (no workspace overlay).
 */

const DARK_PAGE_BACKGROUND = '#09090B';
const DARK_SURFACE_BACKGROUND = '#18181B';

const FIXED_DARK_SHELL = {
  background: DARK_PAGE_BACKGROUND,
  secondary: DARK_SURFACE_BACKGROUND,
  muted: DARK_SURFACE_BACKGROUND,
  accent: DARK_SURFACE_BACKGROUND,
};

function applyRuntimeThemePolicy(theme, surface, mode) {
  const light = { ...(theme && theme.light ? theme.light : {}) };
  const dark = { ...(theme && theme.dark ? theme.dark : {}) };
  const s = String(surface || '').toLowerCase();
  const m = mode === 'dark' ? 'dark' : 'light';

  // POS: workspace colors already stripped upstream (stripWorkspaceColorsForPos),
  // but defensively ensure no workspace-only keys leak if caller passes raw overlay.
  // Here theme is already org-resolved, so no-op — documented for parity.

  // Vendor + POS dark shell: fixed operational surfaces
  if ((s === 'vendor_web' || s === 'vendor_mobile' || s === 'pos_web' || s === 'superadmin_web') && m === 'dark') {
    return {
      ...dark,
      background: DARK_PAGE_BACKGROUND,
      secondary: DARK_SURFACE_BACKGROUND,
      muted: DARK_SURFACE_BACKGROUND,
      accent: DARK_SURFACE_BACKGROUND,
    };
  }

  // Customer/Rider/SaaS: brand-derived, no forcing
  return m === 'dark' ? { ...dark } : { ...light };
}

function effectiveTokensForSurface(resolvedTheme, surface, mode) {
  return applyRuntimeThemePolicy(resolvedTheme, surface, mode);
}

module.exports = {
  DARK_PAGE_BACKGROUND,
  DARK_SURFACE_BACKGROUND,
  FIXED_DARK_SHELL,
  applyRuntimeThemePolicy,
  effectiveTokensForSurface,
};
