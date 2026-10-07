'use strict';

const BRANDING_KEYS = [
  'appName',
  'logoUrl',
  'faviconUrl',
  'wordmarkUrl',
  'ogImageUrl',
  'supportEmail',
  'helpUrl',
];

/**
 * @param {string|null|undefined} raw
 * @returns {Record<string, string>}
 */
function parsePlatformBrandingRaw(raw) {
  const out = {};
  if (!raw || typeof raw !== 'string') return out;
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!p || typeof p !== 'object') return out;
  for (const k of BRANDING_KEYS) {
    if (p[k] != null && String(p[k]).trim() !== '') out[k] = String(p[k]).trim();
  }
  return out;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, string>}
 */
function normalizeBrandingBody(body) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const k of BRANDING_KEYS) {
    const v = body[k];
    if (v != null && String(v).trim() !== '') out[k] = String(v).trim();
  }
  return out;
}

module.exports = {
  BRANDING_KEYS,
  parsePlatformBrandingRaw,
  normalizeBrandingBody,
};
