'use strict';

const {
  safeProjectRefForThemeOverlay,
  mergeOverlayIntoResolvedPublicTheme,
  mergePublicThemeOverlayPatch,
  DELIVERY_FEE_DEFAULTS,
} = require('../lib/workspace-public-theme-merge');

describe('safeProjectRefForThemeOverlay', () => {
  it('returns null for marketplace refs and invalid slugs', () => {
    expect(safeProjectRefForThemeOverlay('_marketplace')).toBeNull();
    expect(safeProjectRefForThemeOverlay('__platform__')).toBeNull();
    expect(safeProjectRefForThemeOverlay('Bad_Ref')).toBeNull();
    expect(safeProjectRefForThemeOverlay('')).toBeNull();
  });

  it('returns normalized slug for valid refs', () => {
    expect(safeProjectRefForThemeOverlay('acme')).toBe('acme');
    expect(safeProjectRefForThemeOverlay('  acme-corp  ')).toBe('acme-corp');
  });
});

describe('mergeOverlayIntoResolvedPublicTheme', () => {
  const base = {
    light: { primary: '#111111' },
    dark: {},
    appName: 'Platform',
    currencyCode: 'gbp',
    mapSettings: { tilePreset: 'osm', defaultZoom: 12 },
    deliveryFeeConfig: { type: 'flat', flatFeeCents: 99, freeDeliveryThresholdCents: 0, tiers: [] },
  };

  it('overrides currency from workspace when set', () => {
    const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, { currency: 'EUR', public_theme_overlay: {} });
    expect(out.currencyCode).toBe('eur');
    expect(out.appName).toBe('Platform');
  });

  it('merges branding, theme tokens, mapSettings, and replaces deliveryFeeConfig when overlay valid', () => {
    const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, {
      currency: 'gbp',
      public_theme_overlay: {
        appName: 'Tenant',
        light: { primary: 'rgb(255, 0, 0)', background: 'url(evil)' },
        mapSettings: { defaultZoom: 15 },
        deliveryFeeConfig: { type: 'flat', flatFeeCents: 500 },
      },
    });
    expect(out.appName).toBe('Tenant');
    expect(out.light.primary).toBe('rgb(255, 0, 0)');
    expect(out.light.background).toBeUndefined();
    expect(out.mapSettings.defaultZoom).toBe(15);
    expect(out.mapSettings.tilePreset).toBe('osm');
    expect(out.deliveryFeeConfig).toEqual({
      ...DELIVERY_FEE_DEFAULTS,
      type: 'flat',
      flatFeeCents: 500,
    });
  });

  it('ignores invalid deliveryFee overlay and leaves base', () => {
    const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, {
      public_theme_overlay: { deliveryFeeConfig: { type: 'nope' } },
    });
    expect(out.deliveryFeeConfig).toEqual(base.deliveryFeeConfig);
  });

  it('treats null workspace as no-op', () => {
    expect(mergeOverlayIntoResolvedPublicTheme(base, null)).toEqual(base);
  });
});

describe('mergePublicThemeOverlayPatch', () => {
  it('patches branding and clears with empty', () => {
    let ex = { appName: 'Old', logoUrl: 'https://x.test/a.png' };
    ex = mergePublicThemeOverlayPatch(ex, { appName: 'New' });
    expect(ex.appName).toBe('New');
    ex = mergePublicThemeOverlayPatch(ex, { logoUrl: null });
    expect(ex.logoUrl).toBeUndefined();
  });

  it('merges theme keys and clears with null mode', () => {
    let ex = mergePublicThemeOverlayPatch(
      {},
      { light: { primary: '#abcdef' }, dark: { background: '#000000' } },
    );
    expect(ex.light.primary).toBe('#abcdef');
    expect(ex.dark.background).toBe('#000000');
    ex = mergePublicThemeOverlayPatch(ex, { light: null });
    expect(ex.light).toBeUndefined();
  });
});
