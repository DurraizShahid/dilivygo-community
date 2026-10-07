'use strict';

const BaseModel = require('./base.model');
const { select, insert, update } = require('../lib/supabase');
const { v4: uuidv4 } = require('uuid');

class AdminSettingsModel extends BaseModel {
  constructor() {
    super('admin_settings');
  }

  async getByProjectRef(projectRef) {
    const rows = await select(this.table, {
      filters: { project_ref: projectRef },
      limit: 1,
    });
    return rows?.[0] || null;
  }

  async upsertByProjectRef(projectRef, settings) {
    const existing = await this.getByProjectRef(projectRef);
    if (existing) {
      await update(this.table, {
        ...settings,
        updated_at: new Date().toISOString(),
      }, { id: existing.id });
      return this.getByProjectRef(projectRef);
    }
    const row = await insert(this.table, {
      id: uuidv4(),
      project_ref: projectRef,
      ...settings,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return row;
  }
}

module.exports = new AdminSettingsModel();
