'use strict';

const { parseColor, parseToOklch, oklchToOklab, oklabToLinearRgb, linearToSrgb, clampOklchToGamut, rgbToHex } = require('./color.js');
const { contrastRatioForColors, chooseReadableForeground, WCAG_AA_NORMAL } = require('./contrast.js');
const { perceptualDistance } = require('./distance.js');
const { isNearWhite, isNearBlack, isNeutral } = require('./classify.js');

const THRESHOLD = WCAG_AA_NORMAL; // 4.5
const PAIRS = [
  ['primary', 'primaryForeground'],
  ['secondary', 'secondaryForeground'],
  ['accent', 'accentForeground'],
  ['background', 'foreground'],
  ['card', 'cardForeground'],
  ['muted', 'mutedForeground'],
  // destructive uses best foreground (black/white) since no dedicated token
  ['destructive', 'destructiveForeground'],
];

function toHex(lch) {
  const lab = oklchToOklab(lch);
  const lin = oklabToLinearRgb(lab);
  const srgb = { r: linearToSrgb(lin.r), g: linearToSrgb(lin.g), b: linearToSrgb(lin.b) };
  const clamped = { r: Math.max(0, Math.min(1, srgb.r)), g: Math.max(0, Math.min(1, srgb.g)), b: Math.max(0, Math.min(1, srgb.b)) };
  return rgbToHex(clamped);
}

function autoCorrectPair(bg, fg, bgKey, fgKey) {
  let bgHex = bg;
  let fgHex = fg;
  let ratio = contrastRatioForColors(fgHex, bgHex);
  if (ratio !== null && ratio >= THRESHOLD) return { bg: bgHex, fg: fgHex, corrected: false, ratio };
  // Try alternative foreground (black/white) preserving hue? For backgrounds, choose readable foreground
  const altFg = chooseReadableForeground(bgHex);
  const altRatio = contrastRatioForColors(altFg, bgHex);
  if (altRatio !== null && altRatio >= THRESHOLD) {
    return { bg: bgHex, fg: altFg, corrected: true, ratio: altRatio, reason: `foreground ${fgKey} auto-corrected to ${altFg} for contrast` };
  }
  // Need to adjust bg lightness preserving hue, reducing chroma if needed
  let lch = parseToOklch(bgHex);
  if (!lch) return { bg: bgHex, fg: fgHex, corrected: false, ratio };
  let best = { bg: bgHex, fg: fgHex, ratio };
  let bestRatio = ratio ?? 0;
  // Try lightness steps: move L away from foreground L
  const fgLch = parseToOklch(fgHex);
  const fgL = fgLch ? fgLch.L : 0.5;
  const direction = lch.L > fgL ? 1 : -1; // if bg lighter than fg, lighten further? Actually need more distance
  // We'll search L in 0.1..0.95 steps, preserve hue, try reducing chroma
  let found = null;
  for (let step = 0; step < 20; step++) {
    const deltaL = (step + 1) * 0.05 * direction;
    let candL = Math.max(0.05, Math.min(0.95, lch.L + deltaL));
    for (const chromaFactor of [1, 0.7, 0.4, 0.1]) {
      const candLch = clampOklchToGamut({ L: candL, C: lch.C * chromaFactor, h: lch.h });
      const candBg = toHex(candLch);
      // try both fg and altFg
      for (const candFg of [fgHex, altFg]) {
        const r = contrastRatioForColors(candFg, candBg);
        if (r !== null && r > bestRatio) { bestRatio = r; best = { bg: candBg, fg: candFg, ratio: r }; }
        if (r !== null && r >= THRESHOLD) { found = { bg: candBg, fg: candFg, ratio: r }; break; }
      }
      if (found) break;
    }
    if (found) break;
  }
  if (found) return { bg: found.bg, fg: found.fg, corrected: true, ratio: found.ratio, reason: `${bgKey}/${fgKey} contrast corrected via lightness/chroma` };
  // fallback to best found even if still below threshold (deterministic)
  if (bestRatio > (ratio ?? 0)) return { bg: best.bg, fg: best.fg, corrected: true, ratio: bestRatio, reason: `best-effort contrast improvement for ${bgKey}/${fgKey}` };
  return { bg: bgHex, fg: fgHex, corrected: false, ratio };
}

function validateTheme(light, dark) {
  const diagnostics = { warnings: [], blockers: [], pairs: {} };
  const checkMode = (mode, theme) => {
    for (const [bgKey, fgKey] of PAIRS) {
      const bg = theme[bgKey];
      // destructiveForeground is NOT a canonical token — derive locally without
      // mutating the caller's theme object (purity required for publish safety).
      // Never write destructiveForeground back into the validated theme.
      let fg = theme[fgKey];
      if (bgKey === 'destructive' && !fg) {
        fg = chooseReadableForeground(bg || '#dc2626');
      }
      if (!bg || !fg) continue;
      const ratio = contrastRatioForColors(fg, bg);
      const passes = ratio !== null && ratio >= THRESHOLD;
      diagnostics.pairs[`${mode}:${bgKey}/${fgKey}`] = { ratio, passes, bg, fg };
      if (!passes) {
        diagnostics.blockers.push(`${mode} ${bgKey}/${fgKey} contrast ${ratio ? ratio.toFixed(2) : 'null'} < ${THRESHOLD}`);
      }
    }
    // Additional diagnostics
    // Colors too similar: primary vs secondary, primary vs accent, secondary vs accent
    const similarPairs = [['primary','secondary'],['primary','accent'],['secondary','accent']];
    for (const [a,b] of similarPairs) {
      if (theme[a] && theme[b]) {
        const d = perceptualDistance(theme[a], theme[b]);
        if (d !== null && d < 0.06) diagnostics.warnings.push(`${mode} ${a} and ${b} too similar (d=${d.toFixed(3)})`);
      }
    }
    // Collapsed hierarchy: background vs card vs muted too close
    const surfacePairs = [['background','card'],['background','muted'],['card','muted']];
    for (const [a,b] of surfacePairs) {
      if (theme[a] && theme[b]) {
        const d = perceptualDistance(theme[a], theme[b]);
        if (d !== null && d < 0.02) diagnostics.warnings.push(`${mode} ${a}/${b} collapsed (d=${d.toFixed(3)})`);
      }
    }
    // Excessive saturation
    for (const k of ['primary','secondary','accent']) {
      if (theme[k]) {
        const lch = parseToOklch(theme[k]);
        if (lch && lch.C > 0.3) diagnostics.warnings.push(`${mode} ${k} excessive chroma C=${lch.C.toFixed(3)}`);
      }
    }
    // Near-white/near-black primary
    if (theme.primary) {
      if (isNearWhite(theme.primary)) diagnostics.warnings.push(`${mode} primary near-white`);
      if (isNearBlack(theme.primary)) diagnostics.warnings.push(`${mode} primary near-black`);
    }
    // Weak/strong borders
    if (theme.border && theme.background) {
      const d = perceptualDistance(theme.border, theme.background);
      if (d !== null && d < 0.02) diagnostics.warnings.push(`${mode} border too weak vs background`);
      if (d !== null && d > 0.3) diagnostics.warnings.push(`${mode} border too strong vs background`);
    }
    // Grayscale
    const brandKeys = ['primary','secondary','accent'].map(k => theme[k]).filter(Boolean);
    if (brandKeys.length && brandKeys.every(c => isNeutral(c, 0.04))) diagnostics.warnings.push(`${mode} grayscale brand palette`);
    // Poor dark hierarchy: background vs card vs muted distances
    if (mode === 'dark') {
      const bg = theme.background, card = theme.card, muted = theme.muted;
      if (bg && card && muted) {
        const d1 = perceptualDistance(bg, card);
        const d2 = perceptualDistance(card, muted);
        if ((d1 !== null && d1 < 0.02) || (d2 !== null && d2 < 0.02)) diagnostics.warnings.push('dark hierarchy poor: surfaces too close');
      }
    }
  };
  checkMode('light', light);
  checkMode('dark', dark);
  diagnostics.ok = diagnostics.blockers.length === 0;
  return diagnostics;
}

function autoCorrectTheme(light, dark) {
  const corrections = [];
  const newLight = { ...light };
  const newDark = { ...dark };
  const correctMode = (mode, theme) => {
    for (const [bgKey, fgKey] of PAIRS) {
      const bg = theme[bgKey];
      let fg = theme[fgKey];
      if (bgKey === 'destructive') {
        if (!bg) continue;
        fg = fg || chooseReadableForeground(bg);
        const res = autoCorrectPair(bg, fg, bgKey, fgKey);
        if (res.corrected) {
          theme[bgKey] = res.bg;
          // Never persist destructiveForeground — not part of the canonical 14-key contract.
          corrections.push(`${mode} ${bgKey}/${fgKey}: ${res.reason} (ratio ${res.ratio.toFixed(2)})`);
        }
        continue;
      }
      if (!bg || !fg) continue;
      const res = autoCorrectPair(bg, fg, bgKey, fgKey);
      if (res.corrected) {
        theme[bgKey] = res.bg;
        theme[fgKey] = res.fg;
        corrections.push(`${mode} ${bgKey}/${fgKey}: ${res.reason} (ratio ${res.ratio.toFixed(2)})`);
      }
    }
  };
  correctMode('light', newLight);
  correctMode('dark', newDark);
  // Canonical contract: strip any destructiveForeground that arrived via input.
  delete newLight.destructiveForeground;
  delete newDark.destructiveForeground;
  const diagnostics = validateTheme(newLight, newDark);
  return { light: newLight, dark: newDark, corrections, diagnostics };
}

function validateManualTheme(light, dark) {
  const diagnostics = validateTheme(light, dark);
  const blockers = diagnostics.blockers;
  const warnings = diagnostics.warnings;
  return { ok: blockers.length === 0, blockers, warnings, pairs: diagnostics.pairs };
}

module.exports = { validateTheme, autoCorrectTheme, autoCorrectPair, validateManualTheme, THRESHOLD, PAIRS };
