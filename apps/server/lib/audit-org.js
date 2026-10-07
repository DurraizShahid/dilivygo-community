'use strict';

const { select } = require('./supabase');

/**
 * @param {string | null | undefined} projectRef
 * @returns {Promise<string | null>}
 */
async function organizationIdByProjectRef(projectRef) {
  const ref = typeof projectRef === 'string' ? projectRef.trim() : '';
  if (!ref) return null;
  const rows = await select('workspaces', {
    filters: { project_ref: ref },
    select: 'organization_id',
    limit: 1,
  });
  return rows?.[0]?.organization_id ?? null;
}

/**
 * @param {string | null | undefined} orderId
 * @returns {Promise<string | null>}
 */
async function organizationIdByOrderId(orderId) {
  if (!orderId) return null;
  const rows = await select('orders', {
    filters: { id: orderId },
    select: 'organization_id,project_ref',
    limit: 1,
  });
  const o = rows?.[0];
  if (o?.organization_id) return o.organization_id;
  if (o?.project_ref) return organizationIdByProjectRef(o.project_ref);
  return null;
}

/**
 * Best-effort org for Stripe webhook idempotency rows (metadata.projectRef, charge metadata, etc.)
 * @param {import('stripe').Stripe.Event} event
 * @returns {Promise<string | null>}
 */
async function organizationIdFromStripeEvent(event) {
  try {
    const obj = event?.data?.object;
    if (!obj || typeof obj !== 'object') return null;
    const meta = obj.metadata && typeof obj.metadata === 'object' ? obj.metadata : {};
    let projectRef = meta.projectRef || meta.project_ref;
    if (!projectRef && typeof obj.payment_intent === 'object' && obj.payment_intent) {
      const piMeta = obj.payment_intent.metadata;
      if (piMeta && typeof piMeta === 'object') {
        projectRef = piMeta.projectRef || piMeta.project_ref;
      }
    }
    if (projectRef) return organizationIdByProjectRef(String(projectRef));
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {{ organization_id?: string | null, project_ref?: string | null } | null | undefined} order
 * @param {string | null | undefined} projectRef
 * @returns {Promise<string | null>}
 */
async function resolveAuditOrgId({ order, projectRef }) {
  if (order?.organization_id) return order.organization_id;
  const ref = projectRef || order?.project_ref;
  if (ref) return organizationIdByProjectRef(String(ref));
  return null;
}

module.exports = {
  organizationIdByProjectRef,
  organizationIdByOrderId,
  organizationIdFromStripeEvent,
  resolveAuditOrgId,
};
