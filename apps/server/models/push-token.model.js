'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { insert, update, remove, supabaseFetch } = require('../lib/supabase');

class PushTokenModel extends BaseModel {
  constructor() {
    super('push_tokens');
  }

  async upsert({ userId, userRole, token, platform, projectRef }) {
    // Upsert: one token per user per platform
    const existing = await this.findOne({ user_id: userId, platform });
    if (existing) {
      return update(this.table, { token, project_ref: projectRef }, { id: existing.id });
    }
    return super.create({
      id: uuidv4(),
      user_id: userId,
      user_role: userRole,
      token,
      platform,
      project_ref: projectRef,
      created_at: new Date().toISOString(),
    });
  }

  async removeToken(userId, platform) {
    const filters = { user_id: userId };
    if (platform) filters.platform = platform;
    return remove(this.table, filters);
  }

  async getTokensForUser(userId, projectRef) {
    return this.findMany({ user_id: userId, project_ref: projectRef }, { select: 'token,platform' });
  }
}

module.exports = new PushTokenModel();
