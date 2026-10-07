'use strict';

/**
 * Platform-level constants for cross-workspace / cross-organization buckets.
 *
 * Model: each organization is its own marketplace (own customers, own riders).
 *   - Customers are org-scoped (unique phone per organization_id).
 *   - Riders belong to a single workspace (`project_ref` set) OR the organization
 *     as a whole (`project_ref = NULL`, `organization_id = org`).
 *   - Customer/Rider WebSocket + Redis buckets are keyed by `organization_id`
 *     (not deployment-wide). See `orgRiderWsRef(orgId)` / `orgCustomerWsRef(orgId)`.
 */

/** Sentinel participant_2 for `customer_support` conversations (not a real user). */
const PLATFORM_SUPPORT_PARTICIPANT_ID = '00000000-0000-0000-0000-0000000000fb';

/** WebSocket registry bucket for superadmin dashboard connections (deployment-wide). */
const PLATFORM_WS_REF = '__platform__';

/** UUID of the synthetic marketplace organization (cross-workspace identities bucket). */
const MARKETPLACE_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Reserved public ref for the legacy "any-org browse" customer endpoint.
 * New code should resolve a real `organizations.public_ref` instead.
 * @deprecated use a specific organization's `public_ref`.
 */
const MARKETPLACE_PUBLIC_REF = '_marketplace';

/** Sentinel scope key for OTP rate limits when no org context is available yet. */
const MARKETPLACE_CUSTOMER_SCOPE = '__marketplace_customer__';

/**
 * @deprecated Use `orgRiderWsRef(organizationId)`.
 * Kept for WS reads during the rollout window so old rider sessions still match.
 */
const PLATFORM_RIDER_WS_REF = '__platform_riders__';

/**
 * WebSocket + Redis bucket for riders with `project_ref = NULL` (org-wide pool).
 * Each organization has its own pool; riders never leak across organizations.
 * @param {string} organizationId
 * @returns {string}
 */
function orgRiderWsRef(organizationId) {
  const id = organizationId != null ? String(organizationId).trim() : '';
  if (!id) return PLATFORM_RIDER_WS_REF;
  return `__org_riders__${id}`;
}

/**
 * WebSocket + Redis bucket for customers whose workspace is NULL (org-marketplace app).
 * Each organization has its own customer bucket — one app per org.
 * @param {string} organizationId
 * @returns {string}
 */
function orgCustomerWsRef(organizationId) {
  const id = organizationId != null ? String(organizationId).trim() : '';
  if (!id) return MARKETPLACE_CUSTOMER_SCOPE;
  return `__org_customers__${id}`;
}

/**
 * WebSocket bucket for SaaS dashboard (org owner/staff) connections.
 *
 * Org-staff connections are ALSO registered in each of their workspace's
 * `project_ref` buckets so all existing `broadcast(projectRef, …)` calls
 * (orders, support chat, refunds, deliveries) naturally reach them. This
 * sentinel bucket is additionally used for org-level events that don't
 * belong to any single workspace (billing, workspace created, etc.).
 *
 * @param {string} organizationId
 * @returns {string}
 */
function orgStaffWsRef(organizationId) {
  const id = organizationId != null ? String(organizationId).trim() : '';
  if (!id) return PLATFORM_WS_REF;
  return `__org_staff__${id}`;
}

/**
 * Whether a given ref is the legacy deployment-wide marketplace sentinel.
 * @param {string|null|undefined} ref
 * @returns {boolean}
 */
function isLegacyMarketplaceRef(ref) {
  return String(ref || '') === MARKETPLACE_PUBLIC_REF;
}

module.exports = {
  PLATFORM_SUPPORT_PARTICIPANT_ID,
  PLATFORM_WS_REF,
  MARKETPLACE_ORGANIZATION_ID,
  MARKETPLACE_PUBLIC_REF,
  MARKETPLACE_CUSTOMER_SCOPE,
  PLATFORM_RIDER_WS_REF,
  orgRiderWsRef,
  orgCustomerWsRef,
  orgStaffWsRef,
  isLegacyMarketplaceRef,
};
