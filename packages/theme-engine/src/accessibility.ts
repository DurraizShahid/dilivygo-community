/**
 * Phase 04 — Accessibility + Quality Enforcement
 * Validates and auto-corrects WCAG contrast, emits diagnostics.
 * Pure, deterministic. TypeScript mirror of accessibility.js — keep in sync.
 * Validation NEVER mutates its inputs and NEVER introduces destructiveForeground
 * into persisted themes (not a canonical token).
 */

import {
  parseColor,
  parseToOklch,
  oklchToOklab,
  oklabToLinearRgb,
  linearToSrgb,
  clampOklchToGamut,
  rgbToHex,
  type Oklch,
} from "./color";
import { contrastRatioForColors, chooseReadableForeground, WCAG_AA_NORMAL } from "./contrast";
import { perceptualDistance } from "./distance";
import { isNearWhite, isNearBlack, isNeutral } from "./classify";

export const CONTRAST_THRESHOLD = WCAG_AA_NORMAL;
export const THRESHOLD = WCAG_AA_NORMAL;

export const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["primary", "primaryForeground"],
  ["secondary", "secondaryForeground"],
  ["accent", "accentForeground"],
  ["background", "foreground"],
  ["card", "cardForeground"],
  ["muted", "mutedForeground"],
  ["destructive", "destructiveForeground"],
];

export interface PairDiagnostic {
  ratio: number | null;
  passes: boolean;
  bg: string;
  fg: string;
}

export interface ThemeDiagnostics {
  warnings: string[];
  blockers: string[];
  pairs: Record<string, PairDiagnostic>;
  ok: boolean;
}

export interface ManualValidation {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  pairs: Record<string, PairDiagnostic>;
}

export interface AutoCorrectResult {
  light: Record<string, string>;
  dark: Record<string, string>;
  corrections: string[];
  diagnostics: ThemeDiagnostics;
}

function toHex(lch: Oklch): string {
  const lab = oklchToOklab(lch);
  const lin = oklabToLinearRgb(lab);
  const srgb = { r: linearToSrgb(lin.r), g: linearToSrgb(lin.g), b: linearToSrgb(lin.b) };
  const clamped = { r: Math.max(0, Math.min(1, srgb.r)), g: Math.max(0, Math.min(1, srgb.g)), b: Math.max(0, Math.min(1, srgb.b)) };
  return rgbToHex(clamped);
}

function autoCorrectPair(
  bg: string,
  fg: string,
  bgKey: string,
  fgKey: string,
): { bg: string; fg: string; corrected: boolean; ratio: number | null; reason?: string } {
  const ratio = contrastRatioForColors(fg, bg);
  if (ratio !== null && ratio >= CONTRAST_THRESHOLD) return { bg, fg, corrected: false, ratio };
  const altFg = chooseReadableForeground(bg);
  const altRatio = contrastRatioForColors(altFg, bg);
  if (altRatio !== null && altRatio >= CONTRAST_THRESHOLD) {
    return { bg, fg: altFg, corrected: true, ratio: altRatio, reason: `foreground ${fgKey} auto-corrected to ${altFg} for contrast` };
  }
  const lch = parseToOklch(bg);
  if (!lch) return { bg, fg, corrected: false, ratio };
  let best = { bg, fg, ratio };
  let bestRatio = ratio ?? 0;
  const fgLch = parseToOklch(fg);
  const fgL = fgLch ? fgLch.L : 0.5;
  const direction = lch.L > fgL ? 1 : -1;
  let found: { bg: string; fg: string; ratio: number } | null = null;
  for (let step = 0; step < 20; step++) {
    const deltaL = (step + 1) * 0.05 * direction;
    const candL = Math.max(0.05, Math.min(0.95, lch.L + deltaL));
    for (const chromaFactor of [1, 0.7, 0.4, 0.1]) {
      const candLch = clampOklchToGamut({ L: candL, C: lch.C * chromaFactor, h: lch.h });
      const candBg = toHex(candLch);
      for (const candFg of [fg, altFg]) {
        const r = contrastRatioForColors(candFg, candBg);
        if (r !== null && r > bestRatio) {
          bestRatio = r;
          best = { bg: candBg, fg: candFg, ratio: r };
        }
        if (r !== null && r >= CONTRAST_THRESHOLD) {
          found = { bg: candBg, fg: candFg, ratio: r };
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }
  if (found) return { bg: found.bg, fg: found.fg, corrected: true, ratio: found.ratio, reason: `${bgKey}/${fgKey} contrast corrected via lightness/chroma` };
  if (bestRatio > (ratio ?? 0))
    return { bg: best.bg, fg: best.fg, corrected: true, ratio: bestRatio, reason: `best-effort contrast improvement for ${bgKey}/${fgKey}` };
  return { bg, fg, corrected: false, ratio };
}

export function validateTheme(light: Record<string, string>, dark: Record<string, string>): ThemeDiagnostics {
  const diagnostics: ThemeDiagnostics = { warnings: [], blockers: [], pairs: {}, ok: true };
  const checkMode = (mode: string, theme: Record<string, string>) => {
    for (const [bgKey, fgKey] of PAIRS) {
      const bg = theme[bgKey];
      let fg = theme[fgKey];
      if (bgKey === "destructive" && !fg) {
        fg = chooseReadableForeground(bg || "#dc2626");
      }
      if (!bg || !fg) continue;
      const ratio = contrastRatioForColors(fg, bg);
      const passes = ratio !== null && ratio >= CONTRAST_THRESHOLD;
      diagnostics.pairs[`${mode}:${bgKey}/${fgKey}`] = { ratio, passes, bg, fg };
      if (!passes) {
        diagnostics.blockers.push(`${mode} ${bgKey}/${fgKey} contrast ${ratio ? ratio.toFixed(2) : "null"} < ${CONTRAST_THRESHOLD}`);
      }
    }
    const similarPairs: Array<[string, string]> = [["primary", "secondary"], ["primary", "accent"], ["secondary", "accent"]];
    for (const [a, b] of similarPairs) {
      if (theme[a] && theme[b]) {
        const d = perceptualDistance(theme[a], theme[b]);
        if (d !== null && d < 0.06) diagnostics.warnings.push(`${mode} ${a} and ${b} too similar (d=${d.toFixed(3)})`);
      }
    }
    const surfacePairs: Array<[string, string]> = [["background", "card"], ["background", "muted"], ["card", "muted"]];
    for (const [a, b] of surfacePairs) {
      if (theme[a] && theme[b]) {
        const d = perceptualDistance(theme[a], theme[b]);
        if (d !== null && d < 0.02) diagnostics.warnings.push(`${mode} ${a}/${b} collapsed (d=${d.toFixed(3)})`);
      }
    }
    for (const k of ["primary", "secondary", "accent"]) {
      if (theme[k]) {
        const lch = parseToOklch(theme[k]);
        if (lch && lch.C > 0.3) diagnostics.warnings.push(`${mode} ${k} excessive chroma C=${lch.C.toFixed(3)}`);
      }
    }
    if (theme.primary) {
      if (isNearWhite(theme.primary)) diagnostics.warnings.push(`${mode} primary near-white`);
      if (isNearBlack(theme.primary)) diagnostics.warnings.push(`${mode} primary near-black`);
    }
    if (theme.border && theme.background) {
      const d = perceptualDistance(theme.border, theme.background);
      if (d !== null && d < 0.02) diagnostics.warnings.push(`${mode} border too weak vs background`);
      if (d !== null && d > 0.3) diagnostics.warnings.push(`${mode} border too strong vs background`);
    }
    const brandKeys = ["primary", "secondary", "accent"].map((k) => theme[k]).filter(Boolean);
    if (brandKeys.length && brandKeys.every((c) => isNeutral(c, 0.04))) diagnostics.warnings.push(`${mode} grayscale brand palette`);
    if (mode === "dark") {
      const bg = theme.background;
      const card = theme.card;
      const muted = theme.muted;
      if (bg && card && muted) {
        const d1 = perceptualDistance(bg, card);
        const d2 = perceptualDistance(card, muted);
        if ((d1 !== null && d1 < 0.02) || (d2 !== null && d2 < 0.02)) diagnostics.warnings.push("dark hierarchy poor: surfaces too close");
      }
    }
  };
  checkMode("light", light);
  checkMode("dark", dark);
  diagnostics.ok = diagnostics.blockers.length === 0;
  return diagnostics;
}

export function autoCorrectTheme(light: Record<string, string>, dark: Record<string, string>): AutoCorrectResult {
  const corrections: string[] = [];
  const newLight = { ...light };
  const newDark = { ...dark };
  const correctMode = (mode: string, theme: Record<string, string>) => {
    for (const [bgKey, fgKey] of PAIRS) {
      const bg = theme[bgKey];
      let fg = theme[fgKey];
      if (bgKey === "destructive") {
        if (!bg) continue;
        fg = fg || chooseReadableForeground(bg);
        const res = autoCorrectPair(bg, fg, bgKey, fgKey);
        if (res.corrected) {
          theme[bgKey] = res.bg;
          // Never persist destructiveForeground — canonical contract has no such key.
          // Keep correction in-memory for contrast only when caller explicitly tracks it.
          if (fgKey !== "destructiveForeground") theme[fgKey] = res.fg;
          corrections.push(`${mode} ${bgKey}/${fgKey}: ${res.reason} (ratio ${res.ratio!.toFixed(2)})`);
        }
        continue;
      }
      if (!bg || !fg) continue;
      const res = autoCorrectPair(bg, fg, bgKey, fgKey);
      if (res.corrected) {
        theme[bgKey] = res.bg;
        theme[fgKey] = res.fg;
        corrections.push(`${mode} ${bgKey}/${fgKey}: ${res.reason} (ratio ${res.ratio!.toFixed(2)})`);
      }
    }
  };
  correctMode("light", newLight);
  correctMode("dark", newDark);
  // Ensure canonical contract: strip any destructiveForeground that may have
  // arrived via caller input — it must never be persisted.
  delete (newLight as Record<string, string>).destructiveForeground;
  delete (newDark as Record<string, string>).destructiveForeground;
  const diagnostics = validateTheme(newLight, newDark);
  return { light: newLight, dark: newDark, corrections, diagnostics };
}

export function validateManualTheme(light: Record<string, string>, dark: Record<string, string>): ManualValidation {
  const diagnostics = validateTheme(light, dark);
  return { ok: diagnostics.blockers.length === 0, blockers: diagnostics.blockers, warnings: diagnostics.warnings, pairs: diagnostics.pairs };
}

// Re-export for JS parity
export { autoCorrectPair };
export type { Oklch };
export { parseColor };
