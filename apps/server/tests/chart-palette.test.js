'use strict';

const { deriveChartPalette } = require('../../../packages/theme-engine/src/chart.js');
const { perceptualDistance } = require('../../../packages/theme-engine/src/distance.js');
const { contrastRatioForColors } = require('../../../packages/theme-engine/src/contrast.js');

describe('Phase 11 — branded chart palette', () => {
  const lightTheme = { primary: '#2563eb', background: '#ffffff', foreground: '#0f172a' };
  const darkTheme = { primary: '#3b82f6', background: '#0f172a', foreground: '#f8fafc' };
  const redTheme = { primary: '#dc2626', background: '#ffffff' };
  const greenTheme = { primary: '#10b981', background: '#ffffff' };
  const grayTheme = { primary: '#808080', background: '#ffffff' };

  it('derives at least 6 colors', () => {
    const palette = deriveChartPalette(lightTheme);
    expect(palette.length).toBeGreaterThanOrEqual(6);
  });

  it('first series relates to brand primary (hue close)', () => {
    const palette = deriveChartPalette(redTheme);
    // First color should be close to primary (distance <0.15) or same hue family
    const d = perceptualDistance(palette[0], redTheme.primary);
    expect(d).not.toBeNull();
    expect(d).toBeLessThan(0.15);
  });

  it('colors are perceptually distinct (pairwise distance >0.08)', () => {
    const palette = deriveChartPalette(lightTheme);
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const d = perceptualDistance(palette[i], palette[j]);
        expect(d).toBeGreaterThan(0.08);
      }
    }
  });

  it('readable on light background (contrast >=1.8)', () => {
    const palette = deriveChartPalette(lightTheme);
    for (const c of palette) {
      const r = contrastRatioForColors(c, lightTheme.background);
      if (r !== null) expect(r).toBeGreaterThanOrEqual(1.8);
    }
  });

  it('readable on dark background', () => {
    const palette = deriveChartPalette(darkTheme, { background: darkTheme.background });
    for (const c of palette) {
      const r = contrastRatioForColors(c, darkTheme.background);
      if (r !== null) expect(r).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('red brand still diverse (not six shades of red)', () => {
    const palette = deriveChartPalette(redTheme);
    const hues = palette.map(c => {
      const { parseToOklch } = require('../../../packages/theme-engine/src/color.js');
      const lch = parseToOklch(c);
      return lch ? Math.round(lch.h / 30) : -1;
    });
    const distinctHues = new Set(hues).size;
    expect(distinctHues).toBeGreaterThanOrEqual(3);
  });

  it('grayscale brand still diverse', () => {
    const palette = deriveChartPalette(grayTheme);
    expect(palette.length).toBeGreaterThanOrEqual(6);
    const distinct = new Set(palette).size;
    expect(distinct).toBe(palette.length);
    // Should not be all gray
    const hasColor = palette.some(c => {
      const { parseToOklch } = require('../../../packages/theme-engine/src/color.js');
      const lch = parseToOklch(c);
      return lch && lch.C > 0.05;
    });
    expect(hasColor).toBe(true);
  });

  it('does not replace semantic error/success/warning encodings (chart palette is separate)', () => {
    const palette = deriveChartPalette(lightTheme);
    // Palette should not contain semantic red/green that would be confused with status
    // We check that palette is not exactly the semantic colors
    expect(palette).not.toContain('#ef4444'); // destructive
    expect(palette).not.toContain('#22c55e'); // success
  });

  it('deterministic: same theme → same palette', () => {
    const a = deriveChartPalette(lightTheme);
    const b = deriveChartPalette(lightTheme);
    expect(a).toEqual(b);
  });

  it('dark mode variant differs from light', () => {
    const lightPal = deriveChartPalette(lightTheme);
    const darkPal = deriveChartPalette(darkTheme, { background: darkTheme.background });
    expect(lightPal).not.toEqual(darkPal);
  });
});
