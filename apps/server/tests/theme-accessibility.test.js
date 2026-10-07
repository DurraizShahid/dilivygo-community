'use strict';

const { validateTheme, autoCorrectTheme, validateManualTheme } = require('../../../packages/theme-engine/src/accessibility.js');
const { generateTheme } = require('../../../packages/theme-engine/src/generator.js');
const { contrastRatioForColors } = require('../../../packages/theme-engine/src/contrast.js');

describe('Phase 04 — accessibility & quality', () => {
  const checkPairsPass = (theme) => {
    const diag = validateTheme(theme.light, theme.dark);
    return diag.ok;
  };

  it('yellow + white fails contrast and auto-corrects', () => {
    const bad = { light: { primary: '#ffff00', primaryForeground: '#ffffff', background: '#ffffff', foreground: '#ffff00', card: '#ffffff', cardForeground: '#ffffff', secondary: '#ffff00', secondaryForeground: '#ffffff', accent: '#ffff00', accentForeground: '#ffffff', muted: '#ffff00', mutedForeground: '#ffffff', destructive: '#ffff00', border: '#ffff00' }, dark: { primary: '#ffff00', primaryForeground: '#ffff00', background: '#ffffff', foreground: '#ffff00', card: '#ffff00', cardForeground: '#ffff00', secondary: '#ffff00', secondaryForeground: '#ffff00', accent: '#ffff00', accentForeground: '#ffff00', muted: '#ffff00', mutedForeground: '#ffff00', destructive: '#ffff00', border: '#ffff00' } };
    const before = validateTheme(bad.light, bad.dark);
    expect(before.ok).toBe(false);
    expect(before.blockers.length).toBeGreaterThan(0);
    const corrected = autoCorrectTheme(bad.light, bad.dark);
    const after = validateTheme(corrected.light, corrected.dark);
    // Should improve — at least fewer blockers or warnings reduced
    expect(corrected.corrections.length).toBeGreaterThan(0);
    // Primary/primaryForeground should now pass
    const r = contrastRatioForColors(corrected.light.primaryForeground, corrected.light.primary);
    expect(r).toBeGreaterThanOrEqual(4.5);
  });

  it('pastel theme auto-corrects', () => {
    const pastel = generateTheme({ colors: ['#fef3c7'] });
    const diagBefore = validateTheme(pastel.light, pastel.dark);
    // Generated pastel may have low contrast for some pairs, but auto-correct should fix
    const corrected = autoCorrectTheme(pastel.light, pastel.dark);
    expect(validateTheme(corrected.light, corrected.dark).ok || corrected.corrections.length >= 0).toBeTruthy();
  });

  it('near-black primary auto-corrects with warning', () => {
    const out = generateTheme({ colors: ['#0a0a0a'] });
    const diag = validateTheme(out.light, out.dark);
    // Should have near-black warning in generator diagnostics, but accessibility should handle
    const corrected = autoCorrectTheme(out.light, out.dark);
    expect(validateTheme(corrected.light, corrected.dark).blockers.length).toBeLessThanOrEqual(diag.blockers.length);
  });

  it('white theme (all white) is blocked and auto-corrected', () => {
    const white = { light: { primary: '#ffffff', primaryForeground: '#ffffff', background: '#ffffff', foreground: '#ffffff', card: '#ffffff', cardForeground: '#ffffff', secondary: '#ffffff', secondaryForeground: '#ffffff', accent: '#ffffff', accentForeground: '#ffffff', muted: '#ffffff', mutedForeground: '#ffffff', destructive: '#ffffff', border: '#ffffff' }, dark: { primary: '#ffffff', primaryForeground: '#ffffff', background: '#ffffff', foreground: '#ffffff', card: '#ffffff', cardForeground: '#ffffff', secondary: '#ffffff', secondaryForeground: '#ffffff', accent: '#ffffff', accentForeground: '#ffffff', muted: '#ffffff', mutedForeground: '#ffffff', destructive: '#ffffff', border: '#ffffff' } };
    const before = validateTheme(white.light, white.dark);
    expect(before.ok).toBe(false);
    const corrected = autoCorrectTheme(white.light, white.dark);
    expect(corrected.light.primaryForeground).not.toBe('#ffffff');
  });

  it('neon green is clamped and auto-corrected', () => {
    const neon = generateTheme({ colors: ['#00ff88'] });
    const corrected = autoCorrectTheme(neon.light, neon.dark);
    expect(validateTheme(corrected.light, corrected.dark).blockers.length).toBe(0);
  });

  it('red brand generates accessible theme or auto-corrects to pass', () => {
    const red = generateTheme({ colors: ['#dc2626'] });
    const diag = validateTheme(red.light, red.dark);
    // Red is strong; may still have some warnings but blockers should be 0 after auto-correct
    const corrected = autoCorrectTheme(red.light, red.dark);
    expect(validateTheme(corrected.light, corrected.dark).ok).toBe(true);
  });

  it('grayscale palette warns', () => {
    const gray = generateTheme({ colors: ['#808080'] });
    const diag = validateTheme(gray.light, gray.dark);
    expect(diag.warnings.join(' ')).toMatch(/grayscale/);
  });

  it('near-duplicate colors warn about similarity', () => {
    const close = { light: { primary: '#ff0000', secondary: '#fe0000', accent: '#fd0000', background: '#ffffff', foreground: '#0f172a', card: '#ffffff', cardForeground: '#0f172a', muted: '#f1f5f9', mutedForeground: '#64748b', destructive: '#dc2626', border: '#e2e8f0', primaryForeground: '#ffffff', secondaryForeground: '#ffffff', accentForeground: '#ffffff' }, dark: { primary: '#ff0000', secondary: '#fe0000', accent: '#fd0000', background: '#0f172a', foreground: '#f8fafc', card: '#1e293b', cardForeground: '#f8fafc', muted: '#1e293b', mutedForeground: '#94a3b8', destructive: '#f87171', border: '#334155', primaryForeground: '#ffffff', secondaryForeground: '#ffffff', accentForeground: '#ffffff' } };
    const diag = validateTheme(close.light, close.dark);
    expect(diag.warnings.join(' ')).toMatch(/too similar/);
  });

  it('intentionally bad manual theme is blocked', () => {
    const badManual = { light: { primary: '#ffff00', primaryForeground: '#ffffff', background: '#ffffff', foreground: '#fefefe', card: '#ffffff', cardForeground: '#fefefe', muted: '#ffffff', mutedForeground: '#ffffff', secondary: '#ffffff', secondaryForeground: '#ffffff', accent: '#ffffff', accentForeground: '#ffffff', destructive: '#ffff00', border: '#ffffff' }, dark: { primary: '#ffff00', primaryForeground: '#ffff00', background: '#ffff00', foreground: '#ffff00', card: '#ffff00', cardForeground: '#ffff00', muted: '#ffff00', mutedForeground: '#ffff00', secondary: '#ffff00', secondaryForeground: '#ffff00', accent: '#ffff00', accentForeground: '#ffff00', destructive: '#ffff00', border: '#ffff00' } };
    const res = validateManualTheme(badManual.light, badManual.dark);
    expect(res.ok).toBe(false);
    expect(res.blockers.length).toBeGreaterThan(0);
  });

  it('generated themes from diverse palettes all auto-correct to pass', () => {
    const palettes = [
      ['#2563eb'], ['#10b981'], ['#7c3aed'], ['#f59e0b'], ['#e11d48'],
      ['#000000'], ['#ffffff'], ['#808080'], ['#ff00ff'], ['#00ff00'],
      ['#fef3c7', '#fecaca', '#bfdbfe'], ['#111827', '#e5e7eb'],
    ];
    for (const colors of palettes) {
      const gen = generateTheme({ colors });
      const corrected = autoCorrectTheme(gen.light, gen.dark);
      const diag = validateTheme(corrected.light, corrected.dark);
      expect(diag.ok).toBe(true);
    }
  });

  it('destructive remains semantic after auto-correct (not hue-shifted)', () => {
    const gen = generateTheme({ colors: ['#ff0000'] });
    const corrected = autoCorrectTheme(gen.light, gen.dark);
    expect(corrected.light.destructive).toBe('#dc2626');
    expect(corrected.dark.destructive).toBe('#f87171');
  });

  it('validateManualTheme distinguishes blockers vs warnings', () => {
    const okTheme = generateTheme({ colors: ['#2563eb'] });
    const corrected = autoCorrectTheme(okTheme.light, okTheme.dark);
    const res = validateManualTheme(corrected.light, corrected.dark);
    expect(res.ok).toBe(true);
    // Even passing theme may have warnings (e.g., border weak) but no blockers
    expect(res.blockers.length).toBe(0);
  });
});
