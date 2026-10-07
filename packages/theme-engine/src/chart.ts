/**
 * Branded chart palette — deterministic, perceptually distinct, readable on theme background.
 * Uses effectiveTheme (light or dark) to derive 6 categorical colors.
 * First is brand primary; rest are distinct hues, not shades of one hue.
 * TypeScript mirror of chart.js — keep in sync.
 */

import { parseToOklch, oklchToOklab, oklabToLinearRgb, linearToSrgb, clampOklchToGamut, rgbToHex, type Oklch } from "./color";
import { perceptualDistance } from "./distance";
import { contrastRatioForColors } from "./contrast";

export interface ChartPaletteOptions {
  count?: number; // default 6
  background?: string; // light or dark background hex, for contrast checks
}

export interface DerivedChartPalette {
  colors: string[];
  background: string;
  primaryRelated: string;
}

function toHex(lch: Oklch): string {
  const lab = oklchToOklab(lch);
  const lin = oklabToLinearRgb(lab);
  const srgb = { r: linearToSrgb(lin.r), g: linearToSrgb(lin.g), b: linearToSrgb(lin.b) };
  const clamped = { r: Math.max(0, Math.min(1, srgb.r)), g: Math.max(0, Math.min(1, srgb.g)), b: Math.max(0, Math.min(1, srgb.b)) };
  return rgbToHex(clamped);
}

function clampHex(lch: Oklch): string {
  return toHex(clampOklchToGamut(lch));
}

/**
 * Derive chart palette from effective theme.
 */
export function deriveChartPalette(theme: Record<string, string>, options: ChartPaletteOptions = {}): string[] {
  const count = Math.max(6, Math.min(12, options.count || 6));
  const background = options.background || theme.background || "#ffffff";
  const primary = theme.primary || "#2563eb";

  let primaryLch = parseToOklch(primary) || parseToOklch("#2563eb")!;
  let primaryHex = primary;
  const primaryContrast = contrastRatioForColors(primary, background);
  if (primaryContrast !== null && primaryContrast < 2.5) {
    const bgLch = parseToOklch(background);
    const targetL = bgLch ? (bgLch.L > 0.5 ? 0.45 : 0.65) : 0.5;
    primaryLch = clampOklchToGamut({ L: targetL, C: Math.min(0.2, primaryLch.C * 0.9), h: primaryLch.h });
    primaryHex = clampHex(primaryLch);
  }

  const colors: string[] = [primaryHex];
  const hues: number[] = [primaryLch.h];
  const offsets = [40, 80, 150, 200, 260];
  const isGrayscale = primaryLch.C < 0.04;
  const baseHues = isGrayscale ? [20, 140, 200, 260, 340] : offsets.map((o) => (primaryLch.h + o) % 360);

  for (let i = 0; i < count - 1; i++) {
    const h = baseHues[i % baseHues.length];
    const lightness = 0.55 + (i % 3) * 0.07;
    const chroma = isGrayscale ? 0.12 + (i % 2) * 0.05 : 0.14 + (i % 2) * 0.04;
    let lch = clampOklchToGamut({ L: lightness, C: chroma, h });
    let hex = clampHex(lch);
    let attempts = 0;
    while (attempts < 5) {
      let tooClose = false;
      for (const existing of colors) {
        const d = perceptualDistance(hex, existing);
        if (d !== null && d < 0.12) {
          tooClose = true;
          break;
        }
      }
      const bgContrast = contrastRatioForColors(hex, background);
      const readable = bgContrast === null || bgContrast >= 1.8;
      if (!tooClose && readable) break;
      lch = clampOklchToGamut({ L: lch.L, C: Math.max(0.08, lch.C - 0.02), h: (lch.h + 15) % 360 });
      hex = clampHex(lch);
      attempts++;
    }
    colors.push(hex);
    hues.push(lch.h);
  }

  const hueDiversity = new Set(hues.map((h) => Math.round(h / 30))).size;
  if (hueDiversity < 3) {
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

export function deriveChartPaletteDetailed(
  theme: Record<string, string>,
  options: ChartPaletteOptions = {},
): DerivedChartPalette {
  const background = options.background || theme.background || "#ffffff";
  const colors = deriveChartPalette(theme, options);
  return { colors, background, primaryRelated: colors[0] };
}
