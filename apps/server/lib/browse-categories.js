'use strict';

const platformSettings = require('../models/platform-settings.model');

const CODE_RE = /^[a-z0-9_]{1,40}$/;

/**
 * @param {unknown} raw - platform_settings value (JSON string or array)
 * @returns {{ code: string, label: string, sortOrder: number, icon?: string, iconImageUrl?: string }[]}
 */
function parseBrowseCategoryPresets(raw) {
  if (raw == null || raw === '') return [];
  let arr;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else {
    return [];
  }
  const out = [];
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const code = String(row.code || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '');
    const label = String(row.label || '').trim();
    if (!code || !label || !CODE_RE.test(code)) continue;
    let sortOrder = Number(row.sortOrder);
    if (!Number.isFinite(sortOrder)) sortOrder = 1000 + out.length;
    const iconRaw = row.icon != null ? String(row.icon).trim().slice(0, 40) : '';
    const iconImageRaw =
      row.iconImageUrl != null ? String(row.iconImageUrl).trim().slice(0, 2048) : '';
    const entry = { code, label, sortOrder };
    if (iconRaw) entry.icon = iconRaw;
    if (iconImageRaw && /^https?:\/\/.+/i.test(iconImageRaw)) entry.iconImageUrl = iconImageRaw;
    out.push(entry);
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  return out;
}

function allowedBrowseCategoryCodes(presets) {
  return new Set((presets || []).map((p) => p.code));
}

/**
 * @param {unknown} ids
 * @param {Set<string>} allowedSet
 * @returns {string[]}
 */
function normalizeBrowseCategoryIds(ids, allowedSet) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const c = String(id || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '');
    if (!c || !allowedSet.has(c) || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/**
 * @param {unknown} raw - DB jsonb / JSON string
 * @returns {string[]}
 */
function parseBrowseCategoryIdsColumn(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p)
        ? p.map((x) => String(x).toLowerCase().trim()).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Strip unknown browse category codes using platform presets (same rules as superadmin shop API).
 * @param {Record<string, unknown>|null|undefined} body
 */
async function normalizeShopBodyBrowseCategoryIds(body, options) {
  if (!body || body.browseCategoryIds === undefined) return body;
  const raw = await platformSettings.get('browse_category_presets', options);
  const presets = parseBrowseCategoryPresets(raw);
  const allowed = allowedBrowseCategoryCodes(presets);
  return {
    ...body,
    browseCategoryIds: normalizeBrowseCategoryIds(body.browseCategoryIds, allowed),
  };
}

module.exports = {
  parseBrowseCategoryPresets,
  allowedBrowseCategoryCodes,
  normalizeBrowseCategoryIds,
  parseBrowseCategoryIdsColumn,
  normalizeShopBodyBrowseCategoryIds,
};
