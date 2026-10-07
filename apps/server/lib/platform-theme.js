'use strict';

/**
 * Keys aligned with `PLATFORM_THEME_FIELD_KEYS` in @dilivygo/types (camelCase in JSON API).
 * @type {readonly string[]}
 */
const THEME_COLOR_KEYS = [
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'accent',
  'accentForeground',
  'background',
  'foreground',
  'muted',
  'mutedForeground',
  'destructive',
  'card',
  'cardForeground',
  'border',
];

const MAX_COLOR_LEN = 120;

/**
 * @param {string} s
 * @returns {boolean}
 */
/**
 * Normalize 3-digit hex to 6-digit for storage and predictable clients.
 * @param {string} t
 * @returns {string}
 */
function normalizeHexColor(t) {
  if (!/^#[0-9a-f]{3}$/i.test(t)) return t;
  const h = t.slice(1).toLowerCase();
  return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
}

function isSafeCssColorValue(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length === 0 || t.length > MAX_COLOR_LEN) return false;
  const lower = t.toLowerCase();
  if (/url\s*\(|expression\s*\(|@import|javascript:|</i.test(lower)) return false;
  if (/[;{}]/.test(t)) return false;
  // Allow hex (#rgb, #rrggbb, #rrggbbaa), rgb/rgba, hsl/hsla, oklch, named transparent
  if (/^transparent$/i.test(t)) return true;
  if (/^#[0-9a-f]{3}$/i.test(t) || /^#[0-9a-f]{6}$/i.test(t) || /^#[0-9a-f]{8}$/i.test(t)) return true;
  if (/^(rgb|rgba|hsl|hsla|oklch|oklab)\(/i.test(t) && t.endsWith(')')) return true;
  return false;
}

/**
 * @param {unknown} obj
 * @returns {Record<string, string>}
 */
function pickThemeColors(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of THEME_COLOR_KEYS) {
    const v = obj[k];
    if (v == null) continue;
    const str = String(v).trim();
    if (!str || !isSafeCssColorValue(str)) continue;
    out[k] = str.startsWith('#') ? normalizeHexColor(str) : str;
  }
  return out;
}

/**
 * @param {string|null|undefined} raw
 * @returns {{ light: Record<string, string>, dark: Record<string, string> }}
 */
function parsePlatformThemeRaw(raw) {
  const empty = { light: {}, dark: {} };
  if (!raw || typeof raw !== 'string') return empty;
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!p || typeof p !== 'object') return empty;
  return {
    light: pickThemeColors(p.light),
    dark: pickThemeColors(p.dark),
  };
}

/**
 * @param {unknown} body
 * @returns {{ light: Record<string, string>, dark: Record<string, string> }}
 */
function normalizePlatformThemeBody(body) {
  if (!body || typeof body !== 'object') return { light: {}, dark: {} };
  const b = body;
  return {
    light: pickThemeColors(b.light),
    dark: pickThemeColors(b.dark),
  };
}

module.exports = {
  THEME_COLOR_KEYS,
  parsePlatformThemeRaw,
  normalizePlatformThemeBody,
  isSafeCssColorValue,
  pickThemeColors,
  normalizeHexColor,
};
