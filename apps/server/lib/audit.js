'use strict';

const { insert } = require('./supabase');
const logger = require('./logger');

/**
 * Write an entry to the audit_log table.
 * Never throws — audit failures must not break business logic.
 *
 * @param {object} entry
 * @param {string} entry.userId
 * @param {string} entry.action        - e.g. 'order.status_changed'
 * @param {string} [entry.resourceType] - e.g. 'order'
 * @param {string} [entry.resourceId]
 * @param {object} [entry.details]
 * @param {string} [entry.ip]
 * @param {string} [entry.organizationId] - SaaS org when known (optional)
 */
async function writeAuditLog({ userId, action, resourceType, resourceId, details, ip, organizationId }) {
  try {
    await insert('audit_log', {
      user_id: userId || null,
      action,
      resource_type: resourceType || null,
      resource_id: resourceId || null,
      details: details ? JSON.stringify(details) : null,
      ip: ip || null,
      organization_id: organizationId || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Audit log write failed', { action, resourceId, error: err.message });
  }
}

module.exports = { writeAuditLog };
