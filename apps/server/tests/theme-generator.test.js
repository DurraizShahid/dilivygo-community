'use strict';

const { generateTheme, SMART_THEME_ENGINE_VERSION, CANONICAL_KEYS } = require('../../../packages/theme-engine/src/generator.js');
const { contrastRatioForColors } = require('../../../packages/theme-engine/src/contrast.js');

describe('Phase 03 — deterministic theme generator', () => {
  const valid = (hex) => /^#[0-9a-f]{6}$/i.test(hex);

  it('outputs every canonical key in light and dark', () => {
    const out = generateTheme({ colors: ['#2563eb'] });
    for (const k of CANONICAL_KEYS) {
      expect(typeof out.light[k]).toBe('string');
      expect(valid(out.light[k])).toBe(true);
      expect(typeof out.dark[k]).toBe('string');
      expect(valid(out.dark[k])).toBe(true);
    }
  });

  it('exposes engine version', () => {
    const out = generateTheme({ colors: ['#ff0000'] });
    expect(out.engineVersion).toBe(SMART_THEME_ENGINE_VERSION);
    expect(out.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('empty / invalid input returns defaults without throwing', () => {
    const empty = generateTheme({ colors: [] });
    expect(empty.light.primary).toBeTruthy();
    expect(empty.dark.primary).toBeTruthy();
    expect(empty.diagnostics.warnings.join(' ')).toMatch(/no valid/);

    const invalid = generateTheme({ colors: ['not-a-color', '', null, 'url(evil)'] });
    expect(invalid.palette.ranked.length).toBe(0);

    const one = generateTheme({ colors: ['#ff0000'] });
    expect(valid(one.light.primary)).toBe(true);
  });

  it('is deterministic: same normalized input → same output', () => {
    const input = { colors: ['#ff0000', '#00ff00', '#0000ff'], strategy: 'balanced' };
    const a = generateTheme(input);
    const b = generateTheme(input);
    expect(a).toEqual(b);
    // Order of input colors should not matter after normalization (sorted by chroma) — except ranked may be same
    const shuffled = generateTheme({ colors: ['#0000ff', '#ff0000', '#00ff00'], strategy: 'balanced' });
    expect(shuffled.light.primary).toBe(a.light.primary);
  });

  it('all strategies produce output with same keys but different values', () => {
    const colors = ['#7c3aed'];
    const bal = generateTheme({ colors, strategy: 'balanced' });
    const bf = generateTheme({ colors, strategy: 'brand-forward' });
    const min = generateTheme({ colors, strategy: 'minimal' });
    for (const k of CANONICAL_KEYS) {
      expect(valid(bal.light[k])).toBe(true);
      expect(valid(bf.light[k])).toBe(true);
      expect(valid(min.light[k])).toBe(true);
    }
    // At least one token should differ across strategies (primary or background)
    expect(bal.light.primary !== bf.light.primary || bal.light.background !== bf.light.background).toBe(true);
    expect(bal.strategy).toBe('balanced');
    expect(bf.strategy).toBe('brand-forward');
    expect(min.strategy).toBe('minimal');
  });

  it('explicit primary/secondary/accent candidates override auto selection', () => {
    const out = generateTheme({
      colors: ['#ff0000', '#00ff00', '#0000ff'],
      primaryCandidate: '#123456',
      secondaryCandidate: '#654321',
      accentCandidate: '#abcdef',
    });
    expect(out.palette.primary.toLowerCase()).toBe('#123456');
    expect(out.palette.secondary.toLowerCase()).toBe('#654321');
    expect(out.palette.accent.toLowerCase()).toBe('#abcdef');
    // Light primary should derive from explicit candidate, not auto ranked[0]
    const auto = generateTheme({ colors: ['#ff0000', '#00ff00', '#0000ff'] });
    expect(out.light.primary).not.toBe(auto.light.primary);
  });

  it('handles one-color palette by deriving secondary/accent', () => {
    const out = generateTheme({ colors: ['#e85d3a'] });
    expect(valid(out.light.secondary)).toBe(true);
    expect(valid(out.light.accent)).toBe(true);
    expect(out.light.secondary).not.toBe(out.light.primary);
    expect(out.light.accent).not.toBe(out.light.primary);
  });

  it('handles multicolor palette: secondary differs from primary', () => {
    const out = generateTheme({ colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] });
    expect(out.palette.ranked.length).toBeGreaterThan(1);
    expect(out.light.secondary).not.toBe(out.light.primary);
  });

  it('handles grayscale palette without crashing and marks diagnostic', () => {
    const out = generateTheme({ colors: ['#808080', '#a0a0a0', '#606060'] });
    expect(out.diagnostics.isGrayscale).toBe(true);
    expect(valid(out.light.primary)).toBe(true);
    expect(valid(out.dark.primary)).toBe(true);
  });

  it('handles black/white luxury case', () => {
    const bw = generateTheme({ colors: ['#000000', '#ffffff'] });
    expect(valid(bw.light.primary)).toBe(true);
    expect(valid(bw.dark.primary)).toBe(true);
    // Should not produce pure white primary in light (would be invisible)
    expect(bw.light.primary.toLowerCase()).not.toBe('#ffffff');
  });

  it('handles very light (pastel) and very dark (near-black) primaries with warnings', () => {
    const pastel = generateTheme({ colors: ['#fef3c7'] });
    expect(valid(pastel.light.primary)).toBe(true);
    const nearBlack = generateTheme({ colors: ['#0a0a0a'] });
    expect(valid(nearBlack.light.primary)).toBe(true);
    expect(nearBlack.diagnostics.hasNearBlackPrimary).toBe(true);
  });

  it('handles neon high-chroma color via gamut clamp', () => {
    const neon = generateTheme({ colors: ['#00ff00'] }); // high chroma green
    expect(valid(neon.light.primary)).toBe(true);
    // Should be clamped, not throw, and remain in gamut
    const p = neon.light.primary;
    expect(valid(p)).toBe(true);
  });

  it('limits to 8 colors and ignores invalid', () => {
    const many = ['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#123456','#654321','#abcdef','#fedcba','invalid'];
    const out = generateTheme({ colors: many });
    expect(out.palette.ranked.length).toBeLessThanOrEqual(8);
  });

  it('primary reflects brand hue ( Shifts hue slightly per strategy but preserves family)', () => {
    const red = generateTheme({ colors: ['#dc2626'], strategy: 'balanced' });
    const blue = generateTheme({ colors: ['#2563eb'], strategy: 'balanced' });
    // red primary should be reddish, blue primary bluish — check they are different and valid
    expect(red.light.primary).not.toBe(blue.light.primary);
    // Both should be valid hex
    expect(valid(red.light.primary)).toBe(true);
    expect(valid(blue.light.primary)).toBe(true);
  });

  it('destructive remains semantic (not brand-colored)', () => {
    const redBrand = generateTheme({ colors: ['#ff0000'] });
    const blueBrand = generateTheme({ colors: ['#0000ff'] });
    expect(redBrand.light.destructive).toBe('#dc2626');
    expect(blueBrand.light.destructive).toBe('#dc2626');
    expect(redBrand.dark.destructive).toBe('#f87171');
  });

  it('border is low-chroma separator, not primary', () => {
    const out = generateTheme({ colors: ['#7c3aed'] });
    expect(out.light.border).not.toBe(out.light.primary);
    expect(valid(out.light.border)).toBe(true);
  });

  it('generates dark intentionally (not inversion) — dark background is dark, not light', () => {
    const out = generateTheme({ colors: ['#2563eb'] });
    const lightBgLum = (() => {
      const { parseColor, relativeLuminance } = require('../../../packages/theme-engine/src/color.js');
      return relativeLuminance(parseColor(out.light.background));
    })();
    const darkBgLum = (() => {
      const { parseColor, relativeLuminance } = require('../../../packages/theme-engine/src/color.js');
      return relativeLuminance(parseColor(out.dark.background));
    })();
    expect(darkBgLum).toBeLessThan(lightBgLum);
    expect(darkBgLum).toBeLessThan(0.1); // dark is near-black
  });

  it('brandStrength bounds 0..1 affect output but stay deterministic', () => {
    const low = generateTheme({ colors: ['#10b981'], brandStrength: 0 });
    const high = generateTheme({ colors: ['#10b981'], brandStrength: 1 });
    expect(low.light.primary).not.toBe(high.light.primary);
    const low2 = generateTheme({ colors: ['#10b981'], brandStrength: 0 });
    expect(low).toEqual(low2);
  });
});
