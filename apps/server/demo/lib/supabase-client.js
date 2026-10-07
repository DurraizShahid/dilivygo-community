'use strict';

const { select, insert, update, remove, supabaseFetch } = require('../../lib/supabase');

/**
 * Bulk insert helper using Supabase REST API.
 * Uses the existing supabase.js infrastructure.
 */
async function bulkInsert(table, rows) {
  if (!rows || rows.length === 0) return [];
  if (rows.length === 1) return [await insert(table, rows[0])];

  // For bulk inserts, use the Supabase REST API with multiple rows
  const result = await supabaseFetch(`/rest/v1/${table}`, {
    method: 'POST',
    body: JSON.stringify(rows),
    headers: {
      'Prefer': 'return=representation',
    },
  });

  return Array.isArray(result) ? result : [result];
}

/**
 * Bulk upsert using Supabase REST API.
 */
async function bulkUpsert(table, rows, onConflict) {
  if (!rows || rows.length === 0) return [];
  if (rows.length === 1) return [await insert(table, rows[0])];

  const result = await supabaseFetch(`/rest/v1/${table}`, {
    method: 'POST',
    body: JSON.stringify(rows),
    headers: {
      'Prefer': 'resolution=merge-duplicates',
      'On-Conflict': onConflict || 'id',
    },
  });

  return Array.isArray(result) ? result : [result];
}

/**
 * Batch execute multiple operations.
 */
async function batchExecute(operations) {
  const results = [];
  for (const op of operations) {
    try {
      const result = await op.fn(op.args);
      results.push({ success: true, result });
    } catch (err) {
      results.push({ success: false, error: err.message });
    }
  }
  return results;
}

/**
 * Count rows in a table with optional filters.
 */
async function countRows(table, filters = {}) {
  const { buildFilters } = require('../../lib/supabase');
  const filterStr = buildFilters(filters);
  const query = filterStr ? `?${filterStr}&select=id` : '?select=id';
  const response = await supabaseFetch(`/rest/v1/${table}${query}`, {
    headers: { 'Prefer': 'count=exact', 'Range': '0-0' },
  });
  return response;
}

module.exports = {
  bulkInsert,
  bulkUpsert,
  batchExecute,
  countRows,
};
