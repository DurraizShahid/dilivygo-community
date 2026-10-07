/**
 * Perceptual distance via OKLab Euclidean (ΔE OK).
 */
import { parseToOklab } from "./color.js";

export function oklabDistance(a: { L: number; a: number; b: number }, b: { L: number; a: number; b: number }): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function perceptualDistance(c1: string, c2: string): number | null {
  const la = parseToOklab(c1);
  const lb = parseToOklab(c2);
  if (!la || !lb) return null;
  return oklabDistance(la, lb);
}

/**
 * Whether two colors are visually similar (below threshold).
 * Threshold 0.08 is roughly "same swatch"; 0.02 is "almost identical".
 */
export function isVisuallySimilar(c1: string, c2: string, threshold = 0.08): boolean {
  const d = perceptualDistance(c1, c2);
  return d !== null && d < threshold;
}
