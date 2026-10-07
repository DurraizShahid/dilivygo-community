'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, update } = require('../lib/supabase');
const config = require('../config');

class MessageModel extends BaseModel {
  constructor() {
    super('messages');
  }

  async getHistory(conversationId, { page = 1 } = {}) {
    const limit = config.chat.pageSize;
    const offset = (page - 1) * limit;
    return select(this.table, {
      filters: { conversation_id: conversationId },
      order: 'created_at.desc',
      limit,
      offset,
    });
  }

  async create({ conversationId, senderId, senderRole, content }) {
    if (content.length > config.chat.maxMessageLength) {
      throw new Error(`Message exceeds ${config.chat.maxMessageLength} character limit`);
    }
    return super.create({
      id: uuidv4(),
      conversation_id: conversationId,
      sender_id: senderId,
      sender_role: senderRole,
      content,
      read_at: null,
      created_at: new Date().toISOString(),
    });
  }

  async markConversationRead(conversationId, readerId) {
    // Mark all messages NOT sent by this user as read
    const { supabaseFetch } = require('../lib/supabase');
    return supabaseFetch(
      `/rest/v1/${this.table}?conversation_id=eq.${encodeURIComponent(conversationId)}&sender_id=neq.${encodeURIComponent(readerId)}&read_at=is.null`,
      {
        method: 'PATCH',
        body: JSON.stringify({ read_at: new Date().toISOString() }),
      }
    );
  }

  async getUnreadCount(conversationId, userId) {
    const rows = await select(this.table, {
      select: 'id',
      filters: { conversation_id: conversationId },
    });
    return (rows || []).filter((m) => !m.read_at && m.sender_id !== userId).length;
  }
}

module.exports = new MessageModel();
