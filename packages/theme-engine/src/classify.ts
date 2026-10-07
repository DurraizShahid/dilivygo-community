/**
 * Classification helpers: near-white / near-black / neutral (low chroma).
 */
import { parseToOklch } from "./color";
import { perceptualDistance } from "./distance";

export function isNearWhite(color: string): boolean {
  const lch = parseToOklch(color);
  if (!lch) return false;
  return lch.L > 0.97 && lch.C < 0.04;
}
export function isNearBlack(color: string): boolean {
  const lch = parseToOklch(color);
  if (!lch) return false;
  return lch.L < 0.15;
}
export function isNeutral(color: string, chromaThreshold = 0.04): boolean {
  const lch = parseToOklch(color);
  if (!lch) return false;
  return lch.C < chromaThreshold;
}
export function isGrayscale(color: string): boolean {
  return isNeutral(color, 0.02);
}

/**
 * Derive a low-chroma neutral from a chroma reference:
 * keep L, drop C to ~0.02, preserve h (or 0).
 */
export function deriveNeutral(baseLch: { L: number; C: number; h: number }, targetL: number): { L: number; C: number; h: number } {
  return { L: targetL, C: Math.min(0.02, baseLch.C * 0.2), h: baseLch.h };
}

/**
 * Deduplicate a list of hex colors: keep first occurrence of each visually distinct bucket.
 * Threshold in OKLab distance (default 0.06).
 */
export function dedupeSimilar(colors: string[], threshold = 0.06): string[] {
  const out: string[] = [];
  for (const c of colors) {
    let dup = false;
    for (const kept of out) {
      const d = perceptualDistance(c, kept);
      if (d !== null && d < threshold) { dup = true; break; }
    }
    if (!dup) out.push(c);
  }
  return out;
}
