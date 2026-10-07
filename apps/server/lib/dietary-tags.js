'use strict';

/**
 * Core platform presets (always valid on products; not stored in platform_settings).
 * Superadmin can add more via `dietary_tag_presets` (additional only).
 */
const CORE_DIETARY_PRESET_DEFINITIONS = [
  { code: 'vegan', label: 'Vegan' },
  { code: 'halal', label: 'Halal' },
  { code: 'gluten_free', label: 'Gluten-Free' },
  { code: 'nut_free', label: 'Nut-Free' },
];

const PRESET_DIETARY_CODES = new Set(CORE_DIETARY_PRESET_DEFINITIONS.map((d) => d.code));

/** Max custom {code,label} rows per shop (keep in sync with vendor-settings.validator). */
const MAX_VENDOR_CUSTOM_DIETARY_TAGS = 30;

function parseCustomDietaryTags(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * @param {unknown} platformRaw - platform_settings.dietary_tag_presets (JSON string or array)
 * @returns {{ code: string; label: string }[]}
 */
function mergePublicDietaryPresets(platformRaw) {
  const extra = parseCustomDietaryTags(platformRaw)
    .map((r) => ({
      code: String(r.code || '').toLowerCase().trim(),
      label: String(r.label || r.code || '').trim(),
    }))
    .filter((r) => r.code && r.label);
  return [...CORE_DIETARY_PRESET_DEFINITIONS, ...extra];
}

/**
 * @param {unknown} customRows - vendor_settings.custom_dietary_tags
 * @param {string[]} [grandfatherTags]
 * @param {unknown} [platformAdditionalRaw] - platform_settings.dietary_tag_presets
 */
function allowedDietaryTagSet(customRows, grandfatherTags = [], platformAdditionalRaw = null) {
  const set = new Set(PRESET_DIETARY_CODES);
  for (const row of parseCustomDietaryTags(platformAdditionalRaw)) {
    if (row && typeof row.code === 'string') {
      const c = row.code.toLowerCase().trim();
      if (c) set.add(c);
    }
  }
  for (const row of parseCustomDietaryTags(customRows)) {
    if (row && typeof row.code === 'string') {
      const c = row.code.toLowerCase().trim();
      if (c) set.add(c);
    }
  }
  for (const t of grandfatherTags) {
    if (typeof t === 'string' && t.trim()) set.add(t.trim().toLowerCase());
  }
  return set;
}

/**
 * @param {string[]|undefined} tags
 * @param {unknown} customDietaryTagsJson
 * @param {string[]|null} grandfatherTags
 * @param {unknown} platformAdditionalRaw
 */
function assertProductDietaryTagsAllowed(tags, customDietaryTagsJson, grandfatherTags, platformAdditionalRaw) {
  if (!tags || !tags.length) return;
  const allowed = allowedDietaryTagSet(customDietaryTagsJson, grandfatherTags || [], platformAdditionalRaw);
  for (const t of tags) {
    const key = typeof t === 'string' ? t.trim().toLowerCase() : '';
    if (!key) continue;
    if (!allowed.has(key)) {
      const err = new Error(
        `Unknown dietary tag: ${t}. Add it as a shop custom tag, or ask the platform admin to add it as a built-in preset.`
      );
      err.statusCode = 400;
      throw err;
    }
  }
}

/** Title-style label from a snake_case tag code (e.g. gluten_free → Gluten Free). */
function humanizeDietaryTagCode(code) {
  const s = String(code || '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return s || String(code);
}

/**
 * Builds updated shop custom_dietary_tags for bulk import: adds any product tag codes
 * not already allowed (built-ins, platform presets, or existing shop customs).
 * @param {unknown} existingCustomRaw - vendor_settings.custom_dietary_tags
 * @param {unknown} platformRaw - platform_settings.dietary_tag_presets
 * @param {Iterable<string>} tagCodesLowercase - union of codes on products (lowercase)
 * @returns {{ merged: { code: string; label: string }[]; added: string[] }}
 */
function mergeBulkAutoCustomDietaryTags(existingCustomRaw, platformRaw, tagCodesLowercase) {
  const existingRows = parseCustomDietaryTags(existingCustomRaw)
    .filter((r) => r && typeof r.code === 'string')
    .map((r) => {
      const code = r.code.toLowerCase().trim();
      const label = String(r.label || r.code || '').trim() || humanizeDietaryTagCode(code);
      return { code, label };
    })
    .filter((r) => r.code);

  const allowed = allowedDietaryTagSet(existingCustomRaw, [], platformRaw);
  const existingCodes = new Set(existingRows.map((r) => r.code));
  const uniqueNew = [];

  for (const t of tagCodesLowercase) {
    const key = typeof t === 'string' ? t.trim().toLowerCase() : '';
    if (!key || allowed.has(key) || existingCodes.has(key)) continue;
    if (PRESET_DIETARY_CODES.has(key)) continue;
    uniqueNew.push(key);
    existingCodes.add(key);
  }

  const dedupedNew = [...new Set(uniqueNew)];

  if (existingRows.length + dedupedNew.length > MAX_VENDOR_CUSTOM_DIETARY_TAGS) {
    const err = new Error(
      `Bulk import would exceed the shop limit of ${MAX_VENDOR_CUSTOM_DIETARY_TAGS} custom dietary tags (${existingRows.length} existing, ${dedupedNew.length} new). Remove some dietary_tags from the CSV or manage tags in settings.`
    );
    err.statusCode = 400;
    throw err;
  }

  const merged = [
    ...existingRows,
    ...dedupedNew.map((code) => ({ code, label: humanizeDietaryTagCode(code) })),
  ];

  return { merged, added: dedupedNew };
}

module.exports = {
  CORE_DIETARY_PRESET_DEFINITIONS,
  PRESET_DIETARY_CODES,
  MAX_VENDOR_CUSTOM_DIETARY_TAGS,
  parseCustomDietaryTags,
  mergePublicDietaryPresets,
  allowedDietaryTagSet,
  assertProductDietaryTagsAllowed,
  humanizeDietaryTagCode,
  mergeBulkAutoCustomDietaryTags,
};
