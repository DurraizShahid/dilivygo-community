/**
 * WCAG contrast + readable foreground helpers.
 */
import { parseColor, relativeLuminance } from "./color.js";

export function contrastRatio(lumA: number, lumB: number): number {
  const L1 = Math.max(lumA, lumB);
  const L2 = Math.min(lumA, lumB);
  return (L1 + 0.05) / (L2 + 0.05);
}

export function contrastRatioForColors(a: string, b: string): number | null {
  const ra = parseColor(a);
  const rb = parseColor(b);
  if (!ra || !rb) return null;
  const la = relativeLuminance(ra);
  const lb = relativeLuminance(rb);
  return contrastRatio(la, lb);
}

/**
 * WCAG thresholds.
 */
export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;
export const WCAG_AAA_NORMAL = 7;

export function meetsContrast(fg: string, bg: string, threshold = WCAG_AA_NORMAL): boolean {
  const r = contrastRatioForColors(fg, bg);
  return r !== null && r >= threshold;
}

/**
 * Choose readable foreground for a given background.
 * Considers near-black (#0a0a0a) vs near-white (#fafafa) vs pure black/white.
 * Returns the one with higher contrast; prefers pure black/white when tie.
 */
export function chooseReadableForeground(bg: string): string {
  const candidates = ["#ffffff", "#fafafa", "#000000", "#0a0a0a"];
  let best = "#000000";
  let bestRatio = -1;
  for (const cand of candidates) {
    const r = contrastRatioForColors(cand, bg);
    if (r !== null && r > bestRatio) {
      bestRatio = r;
      best = cand;
    }
  }
  // Prefer pure black/white when the near variant wins by negligible margin
  // (avoid unexpected #fafafa vs #ffffff drift in snapshots)
  const pureWhiteR = contrastRatioForColors("#ffffff", bg) ?? 0;
  const pureBlackR = contrastRatioForColors("#000000", bg) ?? 0;
  if (best === "#fafafa" && Math.abs(pureWhiteR - bestRatio) < 0.1) return "#ffffff";
  if (best === "#0a0a0a" && Math.abs(pureBlackR - bestRatio) < 0.1) return "#000000";
  return best;
}

/**
 * For demo: explicit logic for yellow/red/blue choices (used in tests).
 * Yellow is light → black text; red is mid → white; deep blue → white.
 */
export function foregroundForBrand(bg: string): string {
  return chooseReadableForeground(bg);
}
