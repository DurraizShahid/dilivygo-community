'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { insert, update, supabaseFetch } = require('../lib/supabase');
const { PLATFORM_SUPPORT_PARTICIPANT_ID } = require('../lib/platform-constants');

class ConversationModel extends BaseModel {
  constructor() {
    super('conversations');
  }

  /**
   * Find existing conversation for an order of a given type, or create it.
   */
  async findOrCreate({ orderId, type, participant1Id, participant2Id, projectRef }) {
    const existing = await this.findOne({
      order_id: orderId,
      type,
    });
    if (existing) return { conversation: existing, created: false };

    const conv = await super.create({
      id: uuidv4(),
      project_ref: projectRef,
      order_id: orderId,
      type,
      participant_1_id: participant1Id,
      participant_2_id: participant2Id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { conversation: conv, created: true };
  }

  async findForUser(userId, projectRef) {
    // Conversations where user is either participant, scoped to project
    return supabaseFetch(
      `/rest/v1/${this.table}?project_ref=eq.${encodeURIComponent(projectRef)}&or=(participant_1_id.eq.${userId},participant_2_id.eq.${userId})&order=updated_at.desc`
    );
  }

  /** Marketplace customer: all conversations for this user across workspaces. */
  async findForUserAllProjects(userId) {
    return supabaseFetch(
      `/rest/v1/${this.table}?or=(participant_1_id.eq.${userId},participant_2_id.eq.${userId})&order=updated_at.desc`
    );
  }

  /**
   * New platform support ticket (customer is participant_1; participant_2 is sentinel).
   */
  async createSupport({ customerId, projectRef, organizationId, subject }) {
    const now = new Date().toISOString();
    return super.create({
      id: uuidv4(),
      project_ref: projectRef,
      ...(organizationId ? { organization_id: organizationId } : {}),
      order_id: null,
      type: 'customer_support',
      participant_1_id: customerId,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
      support_subject: subject || null,
      created_at: now,
      updated_at: now,
    });
  }

  /** All support tickets, newest first (superadmin inbox). */
  async findAllSupport({ limit = 80, offset = 0, organizationId } = {}) {
    let url = `/rest/v1/${this.table}?type=eq.customer_support&order=updated_at.desc&limit=${limit}&offset=${offset}`;
    if (organizationId) {
      url += `&organization_id=eq.${encodeURIComponent(organizationId)}`;
    }
    return supabaseFetch(url);
  }

  isParticipant(conversation, userId) {
    if (!conversation || userId == null || userId === '') return false;
    const uid = String(userId).toLowerCase();
    const p1 =
      conversation.participant_1_id != null
        ? String(conversation.participant_1_id).toLowerCase()
        : '';
    const p2 =
      conversation.participant_2_id != null
        ? String(conversation.participant_2_id).toLowerCase()
        : '';
    return uid === p1 || uid === p2;
  }

  async touch(conversationId) {
    return update(this.table, { updated_at: new Date().toISOString() }, { id: conversationId });
  }

  /** Open (false) or close (true) a customer_support conversation. */
  async setSupportClosed(conversationId, closed) {
    const now = new Date().toISOString();
    const support_closed_at = closed ? now : null;
    return this.updateById(conversationId, {
      support_closed_at,
      updated_at: now,
    });
  }

  getOtherParticipant(conversation, myUserId) {
    return conversation.participant_1_id === myUserId
      ? conversation.participant_2_id
      : conversation.participant_1_id;
  }
}

module.exports = new ConversationModel();
