'use strict';

const config = require('../config');
const logger = require('./logger');
const { isTransientFetchError, networkErrorCode } = require('./transient-network');

const BASE_URL = config.supabase.url;
const SERVICE_KEY = config.supabase.serviceRoleKey || config.supabase.serviceKey;
const ACCESS_TOKEN = config.supabase.accessToken;
const SERVICE_KEY_KIND =
  typeof SERVICE_KEY === 'string' && SERVICE_KEY.startsWith('sb_publishable_')
    ? 'publishable'
    : typeof SERVICE_KEY === 'string' && SERVICE_KEY.startsWith('sb_secret_')
      ? 'secret'
      : typeof SERVICE_KEY === 'string' && SERVICE_KEY.length
        ? 'other'
        : 'missing';

/**
 * Log-safe target label: host + PostgREST path, never the query string.
 *
 * PostgREST filter values routinely carry PII (customer phone/email, project
 * refs), so the query string is deliberately dropped from every log line. The
 * path itself (`/rest/v1/<table>`) carries no row-level data and is what makes
 * the line actionable.
 *
 * @param {string} url
 * @returns {string}
 */
function describeTarget(url) {
  try {
    const parsed = new URL(url);
    const target = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
    return target || parsed.host;
  } catch {
    // Base URL unconfigured or malformed. Fall back to the path — it is built
    // by our own call sites — while still dropping the query string.
    return String(url).split('?')[0].replace(/\/+$/, '') || 'unparseable-target';
  }
}

/**
 * Core Supabase REST API fetch helper.
 * All DB interactions go through this — never raw SQL interpolation.
 *
 * @param {string} path         - e.g. '/rest/v1/orders'
 * @param {object} [options]    - fetch options
 * @param {boolean} [useManagementApi] - true for DDL via Management API
 */
async function supabaseFetch(path, options = {}, useManagementApi = false) {
  const baseUrl = useManagementApi
    ? 'https://api.supabase.com'
    : BASE_URL;

  const url = `${baseUrl}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(useManagementApi
      ? { Authorization: `Bearer ${ACCESS_TOKEN}` }
      : {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: 'return=representation',
        }),
    ...options.headers,
  };

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    // `fetch failed` is undici's catch-all: the actionable reason (connection
    // refused, DNS failure, TLS reset) lives in `err.cause`. Surfacing only the
    // wrapper made a local Supabase stack that had not finished booting look
    // identical to an application bug.
    const transient = isTransientFetchError(err);
    logger.error('Supabase fetch transport error', {
      target: describeTarget(url),
      method: options.method || 'GET',
      reason: networkErrorCode(err),
      transient,
      message: err?.message,
      cause: err?.cause?.message,
    });
    const error = new SupabaseError(
      transient
        ? 'Database temporarily unavailable — please retry'
        : `Supabase request could not be sent: ${err?.message || 'network error'}`,
      503,
      null,
    );
    error.code = 'SUPABASE_UNAVAILABLE';
    error.isOperational = true;
    error.transient = transient;
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Supabase fetch error', {
      url,
      status: response.status,
      body: errorBody,
    });
    throw new SupabaseError(
      `Supabase request failed: ${response.status} ${response.statusText}`,
      response.status,
      errorBody
    );
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

class SupabaseError extends Error {
  constructor(message, statusCode, body) {
    super(message);
    this.name = 'SupabaseError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

/**
 * Execute a raw parameterised SQL query via the Management API.
 * Uses $1, $2, ... placeholders — never string interpolation.
 */
async function executeSQL(projectRef, sql, parameters = []) {
  return supabaseFetch(
    `/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      body: JSON.stringify({ query: sql, parameters }),
    },
    true
  );
}

/**
 * Build a Supabase REST filter query string from a filters object.
 * Supports: eq, neq, gt, gte, lt, lte, like, ilike, is, in
 */
function buildFilters(filters = {}) {
  return Object.entries(filters)
    .map(([key, value]) => {
      if (value === null) return `${key}=is.null`;
      if (Array.isArray(value)) return `${key}=in.(${value.join(',')})`;
      // URLSearchParams will encode values; avoid double-encoding here.
      return `${key}=eq.${value}`;
    })
    .join('&');
}

/**
 * Convenience: SELECT rows from a table.
 */
async function select(table, { select: cols = '*', filters = {}, rawFilters = [], order, limit, offset } = {}) {
  const filterStr = buildFilters(filters);
  const params = new URLSearchParams();
  params.set('select', cols);
  if (filterStr) filterStr.split('&').forEach((f) => { const [k, v] = f.split('='); params.set(k, v); });
  for (const rf of rawFilters) {
    const eqIdx = rf.indexOf('=');
    if (eqIdx > 0) params.set(rf.slice(0, eqIdx), rf.slice(eqIdx + 1));
  }
  if (order) params.set('order', order);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));

  return supabaseFetch(`/rest/v1/${table}?${params.toString()}`);
}

/**
 * Convenience: INSERT row(s).
 */
async function insert(table, data) {
  return supabaseFetch(`/rest/v1/${table}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Convenience: UPDATE rows matching filters.
 */
async function update(table, data, filters = {}) {
  const filterStr = buildFilters(filters);
  const query = filterStr ? `?${filterStr}` : '';
  return supabaseFetch(`/rest/v1/${table}${query}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Convenience: DELETE rows matching filters.
 */
async function remove(table, filters = {}) {
  const filterStr = buildFilters(filters);
  const query = filterStr ? `?${filterStr}` : '';
  return supabaseFetch(`/rest/v1/${table}${query}`, { method: 'DELETE' });
}

module.exports = { supabaseFetch, executeSQL, select, insert, update, remove, SupabaseError };
