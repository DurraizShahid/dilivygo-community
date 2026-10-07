'use strict';

const { parseColor, parseToOklch, hexToRgb, rgbToHex, normalizeHex, clampOklchToGamut, oklabToOklch, oklchToOklab, linearRgbToOklab, oklabToLinearRgb, srgbToLinear, linearToSrgb } = require('./color.js');
const { chooseReadableForeground } = require('./contrast.js');
const { isNearWhite, isNearBlack, isNeutral, dedupeSimilar } = require('./classify.js');

const SMART_THEME_ENGINE_VERSION = '1.0.0';
const CANONICAL_KEYS = ['primary','primaryForeground','secondary','secondaryForeground','accent','accentForeground','background','foreground','muted','mutedForeground','destructive','card','cardForeground','border'];

function toHex(lch) {
  const lab = oklchToOklab(lch);
  const lin = oklabToLinearRgb(lab);
  const srgb = { r: linearToSrgb(lin.r), g: linearToSrgb(lin.g), b: linearToSrgb(lin.b) };
  const clamped = { r: Math.max(0, Math.min(1, srgb.r)), g: Math.max(0, Math.min(1, srgb.g)), b: Math.max(0, Math.min(1, srgb.b)) };
  return rgbToHex(clamped);
}

function clampHex(lch) {
  const clamped = clampOklchToGamut(lch);
  return toHex(clamped);
}

function normalizeInputColors(colors) {
  if (!Array.isArray(colors)) return [];
  const out = [];
  for (const c of colors) {
    if (typeof c !== 'string') continue;
    const t = c.trim();
    if (!t) continue;
    const parsed = parseColor(t);
    if (!parsed) continue;
    const hex = rgbToHex(parsed);
    const n = normalizeHex(hex);
    if (n) out.push(n);
  }
  // dedupe + limit 8, deterministic
  const deduped = dedupeSimilar(out, 0.05);
  // sort by chroma descending deterministically (stable)
  const withChroma = deduped.map((hex) => {
    const lch = parseToOklch(hex);
    return { hex, C: lch ? lch.C : 0, L: lch ? lch.L : 0 };
  });
  withChroma.sort((a,b) => b.C - a.C || b.L - a.L || a.hex.localeCompare(b.hex));
  return withChroma.slice(0, 8).map((x) => x.hex);
}

function pickCandidate(candidate, validSet) {
  if (!candidate || typeof candidate !== 'string') return null;
  const t = candidate.trim();
  if (!t) return null;
  const p = parseColor(t);
  if (!p) return null;
  const hex = normalizeHex(rgbToHex(p));
  if (!hex) return null;
  // allow candidate even if not in ranked list (explicit override)
  return hex;
}

const DEFAULT_LIGHT = {
  primary: '#2563eb', primaryForeground: '#ffffff',
  secondary: '#f1f5f9', secondaryForeground: '#0f172a',
  accent: '#e0f2fe', accentForeground: '#0c4a6e',
  background: '#ffffff', foreground: '#0f172a',
  muted: '#f1f5f9', mutedForeground: '#64748b',
  destructive: '#dc2626', card: '#ffffff', cardForeground: '#0f172a', border: '#e2e8f0',
};
const DEFAULT_DARK = {
  primary: '#3b82f6', primaryForeground: '#0f172a',
  secondary: '#1e293b', secondaryForeground: '#f8fafc',
  accent: '#0c4a6e', accentForeground: '#e0f2fe',
  background: '#0f172a', foreground: '#f8fafc',
  muted: '#1e293b', mutedForeground: '#94a3b8',
  destructive: '#f87171', card: '#1e293b', cardForeground: '#f8fafc', border: '#334155',
};

function ensureLightPrimaryLch(primaryHex, strategy, brandStrength) {
  let lch = parseToOklch(primaryHex);
  if (!lch) lch = parseToOklch(DEFAULT_LIGHT.primary);
  // Clamp chroma to gamut at this L
  // Adjust per strategy
  let targetL = lch.L;
  let targetC = lch.C;
  const s = brandStrength !== undefined ? Math.max(0, Math.min(1, brandStrength)) : 0.5;
  if (strategy === 'brand-forward') { targetC = Math.min(0.35, targetC * (1.1 + s*0.2)); }
  else if (strategy === 'minimal') { targetC = targetC * (0.85 - s*0.1); targetL = targetL * 0.95 + 0.05; }
  else { /* balanced */ targetC = Math.min(0.3, targetC * (1 + s*0.05)); }

  // Ensure not too light/dark for light theme: aim L 0.55..0.75 for primary
  if (targetL > 0.85) targetL = 0.7;
  if (targetL < 0.35) targetL = 0.55;
  // Near-white/black handling
  if (isNearWhite(primaryHex)) { targetC = 0.02; targetL = 0.65; }
  if (isNearBlack(primaryHex)) { targetC = 0.02; targetL = 0.55; }
  const cand = clampOklchToGamut({ L: targetL, C: targetC, h: lch.h });
  return cand;
}

function generateLight(primaryHex, secondaryHex, accentHex, strategy, isGrayscaleBrand, brandStrength) {
  const pLch = ensureLightPrimaryLch(primaryHex, strategy, brandStrength);
  const primary = clampHex(pLch);
  const primaryForeground = chooseReadableForeground(primary);

  // Secondary
  let sLch;
  if (secondaryHex && !isNeutral(secondaryHex, 0.06)) {
    sLch = parseToOklch(secondaryHex);
    if (sLch) sLch = clampOklchToGamut({ L: Math.min(0.96, Math.max(0.88, sLch.L * 0.9 + 0.1)), C: sLch.C * 0.6, h: sLch.h });
  }
  if (!sLch) {
    // derive from primary at higher L, lower C
    sLch = clampOklchToGamut({ L: 0.96, C: Math.min(0.03, pLch.C * 0.25), h: pLch.h });
    if (isGrayscaleBrand) sLch = { L: 0.96, C: 0.01, h: 250 };
  }
  const secondary = clampHex(sLch);
  const secondaryForeground = chooseReadableForeground(secondary);

  // Accent
  let aLch;
  if (accentHex && !isNeutral(accentHex, 0.06)) {
    aLch = parseToOklch(accentHex);
    if (aLch) aLch = clampOklchToGamut({ L: Math.min(0.94, Math.max(0.85, aLch.L * 0.85 + 0.1)), C: aLch.C * 0.7, h: aLch.h });
  }
  if (!aLch) {
    aLch = clampOklchToGamut({ L: 0.92, C: Math.min(0.07, pLch.C * 0.5 + 0.02), h: (pLch.h + 30) % 360 });
    if (isGrayscaleBrand) aLch = { L: 0.92, C: 0.015, h: 250 };
  }
  const accent = clampHex(aLch);
  const accentForeground = chooseReadableForeground(accent);

  // Background / foreground
  const bgTint = strategy === 'brand-forward' ? 0.025 : strategy === 'minimal' ? 0.005 : 0.012;
  const bgLch = clampOklchToGamut({ L: 0.99, C: Math.min(bgTint, pLch.C * 0.08), h: pLch.h });
  const background = clampHex(bgLch);
  const foreground = '#0f172a';

  // Card
  const card = '#ffffff';
  const cardForeground = foreground;

  // Muted
  const mutedLch = clampOklchToGamut({ L: 0.96, C: 0.015, h: pLch.h });
  const muted = clampHex(mutedLch);
  const mutedForeground = '#64748b';

  // Border - low chroma
  const borderLch = clampOklchToGamut({ L: 0.92, C: 0.02, h: pLch.h });
  const border = clampHex(borderLch);

  const destructive = '#dc2626';

  return { primary, primaryForeground, secondary, secondaryForeground, accent, accentForeground, background, foreground, muted, mutedForeground, destructive, card, cardForeground, border };
}

function generateDark(light, primaryHex) {
  const pLchLight = parseToOklch(light.primary) || parseToOklch(DEFAULT_DARK.primary);
  // Dark primary: lighter L than light primary, keep hue, moderate chroma
  const pDarkLch = clampOklchToGamut({ L: Math.min(0.78, pLchLight.L + 0.12), C: pLchLight.C * 0.9, h: pLchLight.h });
  const primary = clampHex(pDarkLch);
  const primaryForeground = chooseReadableForeground(primary);

  // Secondary dark: derived from secondary light but darker
  const sLightLch = parseToOklch(light.secondary);
  const sDarkLch = sLightLch ? clampOklchToGamut({ L: Math.max(0.2, sLightLch.L - 0.65), C: sLightLch.C * 0.7, h: sLightLch.h }) : { L: 0.25, C: 0.02, h: pLchLight.h };
  const secondary = clampHex(sDarkLch);
  const secondaryForeground = chooseReadableForeground(secondary);

  // Accent dark
  const aLightLch = parseToOklch(light.accent);
  const aDarkLch = aLightLch ? clampOklchToGamut({ L: Math.max(0.25, aLightLch.L - 0.55), C: aLightLch.C * 0.8, h: aLightLch.h }) : { L: 0.3, C: 0.06, h: pLchLight.h };
  const accent = clampHex(aDarkLch);
  const accentForeground = chooseReadableForeground(accent);

  // Background/foreground dark - intentional, not inversion: deep neutral with slight brand tint
  const bgDarkLch = clampOklchToGamut({ L: 0.18, C: 0.02, h: pLchLight.h });
  const background = clampHex(bgDarkLch);
  const foreground = '#f8fafc';
  const cardLch = clampOklchToGamut({ L: 0.22, C: 0.02, h: pLchLight.h });
  const card = clampHex(cardLch);
  const cardForeground = foreground;
  const mutedLch = clampOklchToGamut({ L: 0.24, C: 0.015, h: pLchLight.h });
  const muted = clampHex(mutedLch);
  const mutedForeground = '#94a3b8';
  const borderLch = clampOklchToGamut({ L: 0.28, C: 0.015, h: pLchLight.h });
  const border = clampHex(borderLch);
  const destructive = '#f87171';

  return { primary, primaryForeground, secondary, secondaryForeground, accent, accentForeground, background, foreground, muted, mutedForeground, destructive, card, cardForeground, border };
}

function generateTheme(input) {
  const strategy = (input && typeof input.strategy === 'string' && ['balanced','brand-forward','minimal'].includes(input.strategy)) ? input.strategy : 'balanced';
  const brandStrength = input && input.brandStrength !== undefined ? Math.max(0, Math.min(1, Number(input.brandStrength))) : undefined;

  const ranked = normalizeInputColors(input && input.colors ? input.colors : []);
  const warnings = [];
  let isGrayscale = false;
  let hasNearWhitePrimary = false;
  let hasNearBlackPrimary = false;

  if (ranked.length === 0) {
    return {
      light: { ...DEFAULT_LIGHT },
      dark: { ...DEFAULT_DARK },
      palette: { primary: DEFAULT_LIGHT.primary, secondary: null, accent: null, ranked: [] },
      diagnostics: { warnings: ['no valid brand colors — using defaults'], isGrayscale: false, hasNearWhitePrimary: false, hasNearBlackPrimary: false },
      engineVersion: SMART_THEME_ENGINE_VERSION,
      strategy,
    };
  }

  // grayscale detection: all ranked colors neutral
  isGrayscale = ranked.every((c) => isNeutral(c, 0.05));
  if (isGrayscale) warnings.push('grayscale palette — neutrals only, brand link muted');

  const primaryCand = pickCandidate(input.primaryCandidate, ranked);
  const secondaryCand = pickCandidate(input.secondaryCandidate, ranked);
  const accentCand = pickCandidate(input.accentCandidate, ranked);

  let primaryHex = primaryCand || ranked[0];
  if (isNearWhite(primaryHex)) { hasNearWhitePrimary = true; warnings.push('primary near-white — will be darkened for visibility'); }
  if (isNearBlack(primaryHex)) { hasNearBlackPrimary = true; warnings.push('primary near-black — will be lightened'); }

  // Choose secondary / accent from ranked list if not explicitly provided, ensuring perceptual distance from primary
  let secondaryHex = secondaryCand;
  if (!secondaryHex && ranked.length >= 2) {
    for (const cand of ranked) {
      if (cand === primaryHex) continue;
      const d = require('./distance.js').perceptualDistance(cand, primaryHex);
      if (d !== null && d > 0.08) { secondaryHex = cand; break; }
    }
    if (!secondaryHex) secondaryHex = ranked[1];
  }
  let accentHex = accentCand;
  if (!accentHex && ranked.length >= 3) {
    for (const cand of ranked) {
      if (cand === primaryHex || cand === secondaryHex) continue;
      accentHex = cand; break;
    }
  }

  // Handle very light/dark / neon warnings
  const primaryLch = parseToOklch(primaryHex);
  if (primaryLch && primaryLch.C > 0.3) warnings.push('high chroma primary — clamped to sRGB gamut');
  if (primaryLch && primaryLch.L > 0.9) warnings.push('very light primary — ensure contrast');
  if (primaryLch && primaryLch.L < 0.2) warnings.push('very dark primary — ensure contrast');

  const light = generateLight(primaryHex, secondaryHex, accentHex, strategy, isGrayscale, brandStrength);
  const dark = generateDark(light, primaryHex);

  // Ensure every canonical key present
  for (const k of CANONICAL_KEYS) {
    if (!light[k]) light[k] = DEFAULT_LIGHT[k];
    if (!dark[k]) dark[k] = DEFAULT_DARK[k];
  }

  return {
    light, dark,
    palette: { primary: primaryHex, secondary: secondaryHex || null, accent: accentHex || null, ranked },
    diagnostics: { warnings, isGrayscale, hasNearWhitePrimary, hasNearBlackPrimary },
    engineVersion: SMART_THEME_ENGINE_VERSION,
    strategy,
  };
}

module.exports = { generateTheme, SMART_THEME_ENGINE_VERSION, CANONICAL_KEYS, DEFAULT_LIGHT, DEFAULT_DARK };
