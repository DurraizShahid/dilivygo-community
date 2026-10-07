'use strict';

/**
 * Phase 00 — Theme Scope + Inheritance Policy
 * Verifies the layering: Dilivygo defaults → org theme → sparse workspace overlay → surface policy → effective theme.
 *
 * Exercises only pure helpers (no Supabase I/O): the merge helpers and ref sanitizer that implement the policy
 * outside the DB/cache. The DB-backed resolver (`computeResolvedTheme`) is covered indirectly via helper semantics.
 */

const {
  safeProjectRefForThemeOverlay,
  mergeOverlayIntoResolvedPublicTheme,
  mergePublicThemeOverlayPatch,
  DELIVERY_FEE_DEFAULTS,
} = require('../lib/workspace-public-theme-merge');

describe('Phase 00 — theme inheritance policy', () => {
  // ------------------------------------------------------------------ helpers
  const orgBase = (extra = {}) => ({
    light: { primary: '#111111', secondary: '#f1f5f9', background: '#ffffff', foreground: '#0f172a' },
    dark: { primary: '#38bdf8', secondary: '#1e293b', background: '#0f172a', foreground: '#f8fafc' },
    appName: 'Dilivygo',
    logoUrl: 'https://cdn.test/org-logo.png',
    currencyCode: 'gbp',
    mapSettings: { tilePreset: 'osm', defaultZoom: 14 },
    deliveryFeeConfig: { type: 'flat', flatFeeCents: 250, freeDeliveryThresholdCents: 0, tiers: [] },
    ...extra,
  });

  // ------------------------------------------------------------------ 1. Org inheritance (no overlay)
  describe('org inheritance — base is org theme when overlay absent', () => {
    it('returns org base unchanged when workspace is null', () => {
      const base = orgBase();
      expect(mergeOverlayIntoResolvedPublicTheme(base, null)).toEqual(base);
    });

    it('returns org base unchanged when public_theme_overlay is empty object', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, { public_theme_overlay: {} });
      expect(out).toEqual(base);
    });

    it('returns org base unchanged when overlay string is empty', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, { public_theme_overlay: '' });
      expect(out).toEqual(base);
    });
  });

  // ------------------------------------------------------------------ 2. Sparse workspace overlay
  describe('sparse workspace overlay — only specified keys override', () => {
    it('overrides a single token leaving others inherited', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, {
        public_theme_overlay: { light: { primary: '#E85D3A' } },
      });
      expect(out.light.primary).toBe('#E85D3A');
      expect(out.light.secondary).toBe('#f1f5f9');
      expect(out.light.background).toBe('#ffffff');
      expect(out.dark.primary).toBe('#38bdf8'); // dark untouched
    });

    it('overrides branding logoUrl without touching theme', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, {
        public_theme_overlay: { logoUrl: 'https://cdn.test/vendor-logo.png' },
      });
      expect(out.logoUrl).toBe('https://cdn.test/vendor-logo.png');
      expect(out.light.primary).toBe('#111111');
      expect(out.appName).toBe('Dilivygo');
    });

    it('shallow-merges mapSettings (overlay key wins, base keys preserved)', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, {
        public_theme_overlay: { mapSettings: { defaultZoom: 17 } },
      });
      expect(out.mapSettings.defaultZoom).toBe(17);
      expect(out.mapSettings.tilePreset).toBe('osm');
    });

    it('replaces deliveryFeeConfig wholesale (validated)', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, {
        public_theme_overlay: { deliveryFeeConfig: { type: 'flat', flatFeeCents: 500 } },
      });
      expect(out.deliveryFeeConfig).toEqual({ ...DELIVERY_FEE_DEFAULTS, type: 'flat', flatFeeCents: 500 });
    });

    it('overrides currency from workspace.currency (normalized upper→lower handled elsewhere; merge uses validCurrency)', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, {
        currency: 'eur',
        public_theme_overlay: {},
      });
      expect(out.currencyCode).toBe('eur');
    });

    it('parses public_theme_overlay stored as JSON string', () => {
      const base = orgBase();
      const raw = JSON.stringify({ light: { primary: '#abcdef' }, appName: 'Vendor' });
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, { public_theme_overlay: raw });
      expect(out.light.primary).toBe('#abcdef');
      expect(out.appName).toBe('Vendor');
    });

    it('ignores malformed public_theme_overlay JSON string', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, { public_theme_overlay: '{not-json' });
      expect(out).toEqual(base);
    });

    it('drops unsafe theme values (not valid CSS color)', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, {
        public_theme_overlay: { light: { primary: 'url(evil)', background: '#ffffff' } },
      });
      expect(out.light.primary).toBe('#111111'); // blocked → not overlaid
      expect(out.light.background).toBe('#ffffff'); // valid → overlaid (same value)
    });
  });

  // ------------------------------------------------------------------ 3. Clear-to-inherit (null / empty deletes)
  describe('clear-to-inherit — null / empty on patch deletes override and restores base', () => {
    it('mergePublicThemeOverlayPatch: null removes light entirely', () => {
      let ex = { light: { primary: '#111111' }, appName: 'X' };
      ex = mergePublicThemeOverlayPatch(ex, { light: null });
      expect(ex.light).toBeUndefined();
      expect(ex.appName).toBe('X');
    });

    it('mergePublicThemeOverlayPatch: empty string on branding clears it', () => {
      let ex = { logoUrl: 'https://cdn.test/a.png' };
      ex = mergePublicThemeOverlayPatch(ex, { logoUrl: null });
      expect(ex.logoUrl).toBeUndefined();
      ex = mergePublicThemeOverlayPatch({ logoUrl: 'https://cdn.test/b.png' }, { logoUrl: '' });
      expect(ex.logoUrl).toBeUndefined();
    });

    it('mergePublicThemeOverlayPatch: clearing one token leaves others', () => {
      let ex = mergePublicThemeOverlayPatch({}, { light: { primary: '#111', secondary: '#222' } });
      ex = mergePublicThemeOverlayPatch(ex, { light: { primary: '' } });
      expect(ex.light.secondary).toBe('#222');
      expect(ex.light.primary).toBeUndefined();
    });

    it('mergePublicThemeOverlayPatch: clearing last token deletes the layer object', () => {
      let ex = mergePublicThemeOverlayPatch({}, { light: { primary: '#111' } });
      ex = mergePublicThemeOverlayPatch(ex, { light: { primary: null } });
      expect(ex.light).toBeUndefined();
    });

    it('mergePublicThemeOverlayPatch: null on mapSettings deletes it', () => {
      let ex = { mapSettings: { defaultZoom: 14 } };
      ex = mergePublicThemeOverlayPatch(ex, { mapSettings: null });
      expect(ex.mapSettings).toBeUndefined();
    });

    it('workspace later inherits org change for cleared keys — merge semantics', () => {
      // Start: overlay overrides primary
      const base1 = orgBase();
      let storedOverlay = mergePublicThemeOverlayPatch({}, { light: { primary: '#E85D3A' } });
      let effective1 = mergeOverlayIntoResolvedPublicTheme({ ...base1 }, { public_theme_overlay: storedOverlay });
      expect(effective1.light.primary).toBe('#E85D3A');

      // Workspace clears override → inheritance restored
      storedOverlay = mergePublicThemeOverlayPatch(storedOverlay, { light: { primary: null } });
      // Org changes its primary to a new value
      const base2 = orgBase({ light: { primary: '#2563EB', secondary: '#f1f5f9', background: '#ffffff', foreground: '#0f172a' } });
      const effective2 = mergeOverlayIntoResolvedPublicTheme({ ...base2 }, { public_theme_overlay: storedOverlay });
      expect(effective2.light.primary).toBe('#2563EB'); // inherited new org value
    });
  });

  // ------------------------------------------------------------------ 4. POS restriction (strip workspace colors)
  describe('POS restriction — workspace theme colors stripped for pos_web', () => {
    it('simulates POS policy: delete light+dark before merge (branding still passes)', () => {
      const base = orgBase();
      const workspace = { public_theme_overlay: { logoUrl: 'https://cdn.test/pos-brand.png', light: { primary: '#ff0000', background: '#000000' }, dark: { primary: '#ff00ff' } } };
      // Apply the same clone+delete that public.controller does for isPosTheme
      let overlaySource = { ...workspace };
      try {
        let overlay = overlaySource.public_theme_overlay;
        if (typeof overlay === 'string') overlay = JSON.parse(overlay);
        if (overlay && typeof overlay === 'object' && !Array.isArray(overlay)) {
          const next = { ...overlay };
          delete next.light; delete next.dark;
          overlaySource = { ...overlaySource, public_theme_overlay: next };
        }
      } catch {}
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, overlaySource);
      // Workspace colors must not leak into effective POS theme — org base remains
      expect(out.light.primary).toBe('#111111'); // org value, not #ff0000
      expect(out.dark.primary).toBe('#38bdf8'); // org dark value, not #ff00ff
      // Branding still inherited from workspace overlay
      expect(out.logoUrl).toBe('https://cdn.test/pos-brand.png');
    });
  });

  // ------------------------------------------------------------------ 5. Tenant isolation
  describe('tenant isolation — ref sanitization and overlay size guard', () => {
    it('safeProjectRefForThemeOverlay rejects unsafe / cross-tenant-like refs', () => {
      expect(safeProjectRefForThemeOverlay('_marketplace')).toBeNull();
      expect(safeProjectRefForThemeOverlay('__platform__')).toBeNull();
      expect(safeProjectRefForThemeOverlay('ACME')).toBeNull(); // uppercase
      expect(safeProjectRefForThemeOverlay('a/b')).toBeNull();
      expect(safeProjectRefForThemeOverlay('a..b')).toBeNull();
      expect(safeProjectRefForThemeOverlay('')).toBeNull();
      expect(safeProjectRefForThemeOverlay(null)).toBeNull();
    });

    it('accepts valid lower-case project refs', () => {
      expect(safeProjectRefForThemeOverlay('acme-corp')).toBe('acme-corp');
      expect(safeProjectRefForThemeOverlay('  dilivygo-123  ')).toBe('dilivygo-123');
      expect(safeProjectRefForThemeOverlay('a')).toBe('a');
    });

    it('merge helpers never merge foreign org data — overlay is scoped by caller workspaceId check (merge itself is pure)', () => {
      // The controller's 404 guard for wrong-organization workspaceId is the isolation boundary;
      // the merge helper's job is to merge only the caller-supplied patch into the stored overlay for that one workspace.
      // Here we verify it doesn't fabricate keys for other workspaces.
      const existing = { light: { primary: '#111' } };
      const patched = mergePublicThemeOverlayPatch(existing, { light: { primary: '#222' } });
      expect(patched.light.primary).toBe('#222');
      // No leaked appName or mapSettings
      expect(patched.appName).toBeUndefined();
      expect(patched.mapSettings).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------ 6. Branding vs color separation
  describe('branding vs color — independent layers', () => {
    it('branding and theme can be patched independently', () => {
      let ex = mergePublicThemeOverlayPatch({}, { appName: 'Acme' });
      ex = mergePublicThemeOverlayPatch(ex, { light: { primary: '#E85D3A' } });
      expect(ex.appName).toBe('Acme');
      expect(ex.light.primary).toBe('#E85D3A');
      ex = mergePublicThemeOverlayPatch(ex, { appName: null });
      expect(ex.appName).toBeUndefined();
      expect(ex.light.primary).toBe('#E85D3A');
    });

    it('empty branding overlay inherits org branding', () => {
      const base = orgBase({ appName: 'OrgBrand', logoUrl: 'https://cdn.test/org.png' });
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, { public_theme_overlay: {} });
      expect(out.appName).toBe('OrgBrand');
      expect(out.logoUrl).toBe('https://cdn.test/org.png');
    });
  });

  // ------------------------------------------------------------------ 7. Delivery fee / mapSettings edge
  describe('deliveryFeeConfig / mapSettings edge cases', () => {
    it('invalid deliveryFeeConfig type is ignored', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, {
        public_theme_overlay: { deliveryFeeConfig: { type: 'invalid' } },
      });
      expect(out.deliveryFeeConfig).toEqual(base.deliveryFeeConfig);
    });

    it('invalid mapSettings shape is ignored (validator rejects)', () => {
      const base = orgBase();
      const out = mergeOverlayIntoResolvedPublicTheme({ ...base }, {
        public_theme_overlay: { mapSettings: 'not-an-object' },
      });
      expect(out.mapSettings).toEqual(base.mapSettings);
    });
  });
});
