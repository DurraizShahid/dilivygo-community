'use strict';

const { select, insert, update, remove, supabaseFetch } = require('../lib/supabase');

/**
 * Base model — thin wrapper around the Supabase helpers.
 * Each domain model extends this with table-specific methods.
 */
class BaseModel {
  constructor(tableName) {
    this.table = tableName;
  }

  async findById(id, cols = '*') {
    const rows = await select(this.table, { select: cols, filters: { id } });
    return rows?.[0] || null;
  }

  async findOne(filters, cols = '*') {
    const rows = await select(this.table, { select: cols, filters, limit: 1 });
    return rows?.[0] || null;
  }

  async findMany(filters = {}, { select: cols = '*', order, limit, offset } = {}) {
    return select(this.table, { select: cols, filters, order, limit, offset });
  }

  async create(data) {
    const rows = await insert(this.table, data);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async updateById(id, data) {
    const rows = await update(this.table, data, { id });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async deleteById(id) {
    return remove(this.table, { id });
  }

  async count(filters = {}) {
    const { buildFilters } = require('../lib/supabase');
    const filterStr = buildFilters ? buildFilters(filters) : '';
    // Use head request for count
    const query = filterStr ? `?${filterStr}&select=id` : '?select=id';
    const response = await supabaseFetch(`/rest/v1/${this.table}${query}`, {
      headers: { 'Prefer': 'count=exact', 'Range': '0-0' },
    });
    return response;
  }
}

module.exports = BaseModel;
