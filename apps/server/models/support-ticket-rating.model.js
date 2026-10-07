'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, insert } = require('../lib/supabase');

class SupportTicketRatingModel extends BaseModel {
  constructor() {
    super('support_ticket_ratings');
  }

  async findByConversationId(conversationId) {
    const rows = await select(this.table, {
      filters: { conversation_id: conversationId },
      limit: 1,
    });
    return rows?.[0] || null;
  }

  async findPage({ limit = 50, offset = 0, organizationId } = {}) {
    return select(this.table, {
      filters: organizationId ? { organization_id: organizationId } : {},
      order: 'created_at.desc',
      limit,
      offset,
    });
  }

  /** All ratings with created_at >= sinceIso (for analytics). */
  async findSince(sinceIso, { organizationId } = {}) {
    const rawFilters = [`created_at=gte.${sinceIso}`];
    if (organizationId) rawFilters.push(`organization_id=eq.${organizationId}`);
    return select(this.table, {
      rawFilters,
      order: 'created_at.asc',
      limit: 100000,
    });
  }

  /** First submission only; callers must reject duplicates. */
  async createForConversation({
    conversationId,
    projectRef,
    customerId,
    ticketSubject,
    stars,
    comment,
  }) {
    const now = new Date().toISOString();
    const out = await insert(this.table, {
      id: uuidv4(),
      conversation_id: conversationId,
      project_ref: projectRef,
      customer_id: customerId,
      ticket_subject: ticketSubject || null,
      stars,
      comment: comment != null ? comment : null,
      created_at: now,
      updated_at: now,
    });
    return Array.isArray(out) ? out[0] : out;
  }
}

module.exports = new SupportTicketRatingModel();
