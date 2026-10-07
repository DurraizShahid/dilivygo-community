'use strict';

const { parseColor, parseToOklch, oklchToOklab, oklabToLinearRgb, linearToSrgb, clampOklchToGamut, rgbToHex } = require('./color.js');
const { perceptualDistance } = require('./distance.js');
const { contrastRatioForColors } = require('./contrast.js');

function toHex(lch) {
  const lab = oklchToOklab(lch);
  const lin = oklabToLinearRgb(lab);
  const srgb = { r: linearToSrgb(lin.r), g: linearToSrgb(lin.g), b: linearToSrgb(lin.b) };
  const clamped = { r: Math.max(0, Math.min(1, srgb.r)), g: Math.max(0, Math.min(1, srgb.g)), b: Math.max(0, Math.min(1, srgb.b)) };
  return rgbToHex(clamped);
}
function clampHex(lch) { return toHex(clampOklchToGamut(lch)); }

/**
 * Derive chart palette from effective theme.
 * @param {Record<string,string>} theme - ThemeColors light or dark
 * @param {object} [options]
 * @returns {string[]} 6 colors
 */
function deriveChartPalette(theme, options = {}) {
  const count = Math.max(6, Math.min(12, options.count || 6));
  const background = options.background || theme.background || '#ffffff';
  const primary = theme.primary || '#2563eb';

  // Ensure primary is readable on background — if not, use clamped variant
  let primaryLch = parseToOklch(primary) || parseToOklch('#2563eb');
  let primaryHex = primary;
  const primaryContrast = contrastRatioForColors(primary, background);
  if (primaryContrast !== null && primaryContrast < 2.5) {
    // Adjust primary lightness to improve contrast while preserving hue
    const bgLch = parseToOklch(background);
    const targetL = bgLch ? (bgLch.L > 0.5 ? 0.45 : 0.65) : 0.5;
    primaryLch = clampOklchToGamut({ L: targetL, C: Math.min(0.2, primaryLch.C * 0.9), h: primaryLch.h });
    primaryHex = clampHex(primaryLch);
  }

  const colors = [primaryHex];
  // Generate distinct hues by rotating primary hue
  const hues = [primaryLch.h];
  // Preset hue offsets for categorical distinctness (avoid too close)
  const offsets = [40, 80, 150, 200, 260];
  // For grayscale brand (low chroma), use fixed diverse hues
  const isGrayscale = primaryLch.C < 0.04;
  const baseHues = isGrayscale ? [20, 140, 200, 260, 340] : offsets.map(o => (primaryLch.h + o) % 360);

  for (let i = 0; i < count - 1; i++) {
    const h = baseHues[i % baseHues.length];
    // Vary L and C for diversity, ensure distinct and readable
    const lightness = 0.55 + (i % 3) * 0.07; // 0.55, 0.62, 0.69
    const chroma = isGrayscale ? 0.12 + (i % 2) * 0.05 : 0.14 + (i % 2) * 0.04;
    let lch = clampOklchToGamut({ L: lightness, C: chroma, h });
    let hex = clampHex(lch);
    // Ensure distinct from previous colors (perceptual distance >0.12)
    let attempts = 0;
    while (attempts < 5) {
      let tooClose = false;
      for (const existing of colors) {
        const d = perceptualDistance(hex, existing);
        if (d !== null && d < 0.12) { tooClose = true; break; }
      }
      const bgContrast = contrastRatioForColors(hex, background);
      const readable = bgContrast === null || bgContrast >= 1.8; // at least somewhat readable on background
      if (!tooClose && readable) break;
      // Adjust
      lch = clampOklchToGamut({ L: lch.L, C: Math.max(0.08, lch.C - 0.02), h: (lch.h + 15) % 360 });
      hex = clampHex(lch);
      attempts++;
    }
    colors.push(hex);
    hues.push(lch.h);
  }

  // Ensure not all shades of one hue: check hue diversity
  const hueDiversity = new Set(hues.map(h => Math.round(h / 30))).size;
  if (hueDiversity < 3) {
    // Force diversity by replacing some
    for (let i = 1; i < colors.length; i++) {
      const lch = parseToOklch(colors[i]);
      if (lch) {
        const newH = (primaryLch.h + 60 + i * 50) % 360;
        const newLch = clampOklchToGamut({ L: lch.L, C: lch.C, h: newH });
        colors[i] = clampHex(newLch);
      }
    }
  }

  return colors.slice(0, count);
}

module.exports = { deriveChartPalette };
