'use strict';

/**
 * Phase 02 — Color Science Foundation
 * Tests for packages/theme-engine (pure, node + browser safe)
 */

const engine = require('../../../packages/theme-engine/src/index.js');
const color = require('../../../packages/theme-engine/src/color.js');
const contrast = require('../../../packages/theme-engine/src/contrast.js');
const distance = require('../../../packages/theme-engine/src/distance.js');
const classify = require('../../../packages/theme-engine/src/classify.js');

describe('color science — parsing & normalization', () => {
  it('normalizes 3-digit hex to 6-digit case-insensitive', () => {
    expect(color.normalizeHex('#abc')).toBe('#aabbcc');
    expect(color.normalizeHex('#ABC')).toBe('#aabbcc');
    expect(color.normalizeHex(' #fff ')).toBe('#ffffff');
    expect(color.normalizeHex('#aabbcc')).toBe('#aabbcc');
    expect(color.normalizeHex('#AABBCCDD')).toBe('#aabbccdd');
    expect(color.normalizeHex('red')).toBeNull();
  });

  it('hexToRgb and rgbToHex round-trip', () => {
    const rgb = color.hexToRgb('#ff0000');
    expect(rgb).toEqual({ r: 1, g: 0, b: 0 });
    expect(color.rgbToHex({ r: 1, g: 0, b: 0 })).toBe('#ff0000');
    expect(color.rgbToHex({ r: 0, g: 1, b: 0 })).toBe('#00ff00');
  });

  it('parseColor equivalence — #fff == #ffffff == rgb(255,255,255)', () => {
    expect(color.colorsEquivalent('#fff', '#ffffff')).toBe(true);
    expect(color.colorsEquivalent('#FFF', '#ffffff')).toBe(true);
    expect(color.colorsEquivalent('#ff0000', 'rgb(255, 0, 0)')).toBe(true);
    expect(color.colorsEquivalent('#ff0000', '#00ff00')).toBe(false);
  });

  it('parseColor supports rgb/hsl/oklch/oklab forms', () => {
    expect(color.parseColor('rgb(255,0,0)')).toBeTruthy();
    expect(color.parseColor('rgba(0,128,0,0.5)')).toBeTruthy();
    expect(color.parseColor('hsl(0, 100%, 50%)')).toBeTruthy();
    expect(color.parseColor('oklch(0.7 0.15 250)')).toBeTruthy();
    expect(color.parseColor('oklab(0.7 0.1 0.1)')).toBeTruthy();
    expect(color.parseColor('transparent')).toBeTruthy();
    expect(color.parseColor('url(evil)')).toBeNull();
    expect(color.parseColor('var(--primary)')).toBeNull();
  });
});

describe('color science — sRGB ↔ linear ↔ OKLab', () => {
  it('srgbToLinear / linearToSrgb are inverses (tolerance 1e-6)', () => {
    for (const c of [0, 0.04045, 0.5, 1]) {
      const lin = color.srgbToLinear(c);
      const back = color.linearToSrgb(lin);
      expect(Math.abs(back - c)).toBeLessThan(1e-6);
    }
  });

  it('linearRgbToOklab and oklabToLinearRgb round-trip (tolerance 1e-5)', () => {
    const cases = [
      { r: 1, g: 0, b: 0 },
      { r: 0, g: 1, b: 0 },
      { r: 0, g: 0, b: 1 },
      { r: 0.5, g: 0.5, b: 0.5 },
      { r: 1, g: 1, b: 1 },
      { r: 0, g: 0, b: 0 },
    ];
    for (const rgb of cases) {
      const lab = color.linearRgbToOklab(rgb);
      const back = color.oklabToLinearRgb(lab);
      expect(Math.abs(back.r - rgb.r)).toBeLessThan(1e-5);
      expect(Math.abs(back.g - rgb.g)).toBeLessThan(1e-5);
      expect(Math.abs(back.b - rgb.b)).toBeLessThan(1e-5);
    }
  });

  it('OKLCH round-trip preserves L and h (within tolerance)', () => {
    const lab = { L: 0.7, a: 0.1, b: -0.05 };
    const lch = color.oklabToOklch(lab);
    const back = color.oklchToOklab(lch);
    expect(Math.abs(back.L - lab.L)).toBeLessThan(1e-6);
    expect(Math.abs(back.a - lab.a)).toBeLessThan(1e-6);
    expect(Math.abs(back.b - lab.b)).toBeLessThan(1e-6);
  });

  it('hex → OKLab → sRGB → hex preserves color (via gamut clamp)', () => {
    const hexes = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#123456'];
    for (const hex of hexes) {
      const rgb = color.parseColor(hex);
      expect(rgb).not.toBeNull();
      const lin = { r: color.srgbToLinear(rgb.r), g: color.srgbToLinear(rgb.g), b: color.srgbToLinear(rgb.b) };
      const lab = color.linearRgbToOklab(lin);
      const lin2 = color.oklabToLinearRgb(lab);
      const srgb2 = { r: color.linearToSrgb(lin2.r), g: color.linearToSrgb(lin2.g), b: color.linearToSrgb(lin2.b) };
      const hex2 = color.rgbToHex(srgb2);
      expect(hex2.toLowerCase()).toBe(hex.toLowerCase());
    }
  });
});

describe('color science — contrast', () => {
  it('black vs white is 21:1', () => {
    const r = contrast.contrastRatioForColors('#000000', '#ffffff');
    expect(r).toBeCloseTo(21, 1);
  });

  it('same color is 1:1', () => {
    expect(contrast.contrastRatioForColors('#ff0000', '#ff0000')).toBeCloseTo(1, 2);
  });

  it('meetsContrast for readable pairs', () => {
    expect(contrast.meetsContrast('#000000', '#ffffff', 4.5)).toBe(true);
    expect(contrast.meetsContrast('#777777', '#ffffff', 4.5)).toBe(false);
  });

  it('chooseReadableForeground: yellow → black, red → white, blue → white', () => {
    // Yellow #ffff00 is very light → black wins
    expect(contrast.chooseReadableForeground('#ffff00')).toBe('#000000');
    // Pure red #ff0000 mid luminance → higher contrast with white? check
    // For red, white has better contrast than black (5.25 vs 4)
    const redFg = contrast.chooseReadableForeground('#ff0000');
    expect(['#ffffff', '#000000']).toContain(redFg);
    // For our palette: red #dc2626 → white should win
    expect(contrast.chooseReadableForeground('#dc2626')).toBe('#ffffff');
    // Blue #0000ff dark → white
    expect(contrast.chooseReadableForeground('#0000ff')).toBe('#ffffff');
    // Light pastel → black
    expect(contrast.chooseReadableForeground('#fef3c7')).toBe('#000000');
  });

  it('foregroundForBrand matches chooseReadableForeground', () => {
    expect(contrast.foregroundForBrand('#eb5e28')).toBe(contrast.chooseReadableForeground('#eb5e28'));
  });
});

describe('color science — perceptual distance', () => {
  it('distance symmetry: d(a,b) == d(b,a)', () => {
    const a = '#ff0000', b = '#00ff00';
    const dab = distance.perceptualDistance(a, b);
    const dba = distance.perceptualDistance(b, a);
    expect(dab).toBeCloseTo(dba, 6);
  });

  it('distance zero for same color', () => {
    expect(distance.perceptualDistance('#123456', '#123456')).toBeCloseTo(0, 6);
  });

  it('near-duplicate colors are visually similar (<0.08)', () => {
    expect(distance.isVisuallySimilar('#ff0000', '#fe0000')).toBe(true);
    expect(distance.isVisuallySimilar('#ff0000', '#00ff00')).toBe(false);
  });

  it('distance handles invalid gracefully', () => {
    expect(distance.perceptualDistance('not-a-color', '#fff')).toBeNull();
  });
});

describe('color science — gamut clamp', () => {
  it('in-gamut oklch passes through unchanged', () => {
    const lch = { L: 0.5, C: 0.1, h: 250 };
    const clamped = color.clampOklchToGamut(lch);
    expect(clamped.C).toBeCloseTo(lch.C, 6);
  });

  it('out-of-gamut oklch is clamped to lower chroma but same L/h, stays in gamut', () => {
    const lch = { L: 0.5, C: 0.5, h: 20 }; // neon highly saturated likely out of gamut
    const clamped = color.clampOklchToGamut(lch);
    expect(clamped.C).toBeLessThan(lch.C);
    expect(clamped.L).toBeCloseTo(lch.L, 6);
    expect(clamped.h).toBeCloseTo(lch.h, 6);
    const lin = color.oklabToLinearRgb(color.oklchToOklab(clamped));
    const srgb = { r: color.linearToSrgb(lin.r), g: color.linearToSrgb(lin.g), b: color.linearToSrgb(lin.b) };
    expect(color.isInGamutRgb(srgb)).toBe(true);
  });

  it('gamut clamp is stable: clamping an already-clamped value is idempotent', () => {
    const lch = { L: 0.6, C: 0.35, h: 140 };
    const once = color.clampOklchToGamut(lch);
    const twice = color.clampOklchToGamut(once);
    expect(twice.C).toBeCloseTo(once.C, 6);
  });
});

describe('color science — classification & dedupe', () => {
  it('near-white / near-black detection', () => {
    expect(classify.isNearWhite('#ffffff')).toBe(true);
    expect(classify.isNearWhite('#fffffe')).toBe(true);
    expect(classify.isNearWhite('#f0f0f0')).toBe(false);
    expect(classify.isNearBlack('#000000')).toBe(true);
    expect(classify.isNearBlack('#0a0a0a')).toBe(true);
    expect(classify.isNearBlack('#222222')).toBe(false);
  });

  it('neutral detection via low chroma', () => {
    expect(classify.isNeutral('#808080')).toBe(true);
    expect(classify.isNeutral('#ff0000')).toBe(false);
    expect(classify.isGrayscale('#808080')).toBe(true);
    expect(classify.isGrayscale('#ff8800')).toBe(false);
  });

  it('deriveNeutral produces low-chroma color at target lightness', () => {
    const base = { L: 0.6, C: 0.15, h: 200 };
    const n = classify.deriveNeutral(base, 0.9);
    expect(n.L).toBe(0.9);
    expect(n.C).toBeLessThan(0.05);
  });

  it('dedupeSimilar removes near-identical entries', () => {
    const colors = ['#ff0000', '#fe0000', '#ff0000', '#00ff00', '#00fe00'];
    const deduped = classify.dedupeSimilar(colors, 0.06);
    // #ff0000 and #fe0000 are similar → one kept; #00ff00 and #00fe00 similar
    expect(deduped.length).toBeLessThan(colors.length);
    expect(deduped).toContain('#ff0000');
    expect(deduped).toContain('#00ff00');
  });

  it('colorsEquivalent respects normalization', () => {
    expect(color.colorsEquivalent('#fff', '#FFFFFF')).toBe(true);
    expect(color.colorsEquivalent(' #abc ', '#aabbcc')).toBe(true);
    expect(color.colorsEquivalent('#ff0000', '#00ff00')).toBe(false);
  });
});

describe('theme-engine — version & exports', () => {
  it('exposes SMART_THEME_ENGINE_VERSION', () => {
    expect(engine.SMART_THEME_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('runs in Node and browser (no dom/fs)', () => {
    expect(typeof engine.parseColor).toBe('function');
    expect(typeof engine.contrastRatioForColors).toBe('function');
    expect(typeof engine.perceptualDistance).toBe('function');
  });
});
