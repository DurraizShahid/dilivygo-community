'use strict';

const config = require('../config');
const { select } = require('../lib/supabase');
// Commercial: SaaS billing engine is not part of the Community Edition.
// When SAAS_BILLING_ENABLED is unset (CE default) the middleware passes through;
// the guarded require + fallbacks below preserve that behavior.
let isBillingStatusAllowedForMutations = () => true;
let getOrganizationBillingRowForProjectRef = async () => null;
try {
  ({
    isBillingStatusAllowedForMutations,
    getOrganizationBillingRowForProjectRef,
  } = require('../services/workspace-billing.service'));
} catch {
  // commercial module absent in CE — fallbacks above apply
}

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * When `SAAS_BILLING_ENABLED` is true, blocks staff/vendor mutating requests if the workspace
 * subscription is not in an allowed state (trialing / active, optional past_due grace).
 * Skips GET/HEAD/OPTIONS. Requires `req.projectRef` (use after `requireProjectRef`).
 */
async function requireWorkspaceSubscription(req, res, next) {
  try {
    if (!config.saasBilling.enabled) {
      return next();
    }
    if (!MUTATING.has(String(req.method || '').toUpperCase())) {
      return next();
    }
    const projectRef = req.projectRef;
    if (!projectRef) {
      return next();
    }
    const rows = await select('workspaces', { filters: { project_ref: String(projectRef) }, limit: 1 });
    const row = rows?.[0];
    if (!row) {
      return res.status(403).json({
        error: 'Workspace not found for billing check',
        code: 'WORKSPACE_SUBSCRIPTION_REQUIRED',
      });
    }
    if (!row.organization_id) {
      return next();
    }
    const orgRow = await getOrganizationBillingRowForProjectRef(projectRef);
    if (!orgRow) {
      return next();
    }
    const ok = isBillingStatusAllowedForMutations(orgRow.billing_subscription_status, orgRow, {
      pastDueGraceDays: config.saasBilling.pastDueGraceDays,
    });
    if (!ok) {
      return res.status(403).json({
        error:
          'An active workspace subscription is required for this action. Open the SaaS dashboard to subscribe or fix billing.',
        code: 'WORKSPACE_SUBSCRIPTION_REQUIRED',
      });
    }
    return next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireWorkspaceSubscription };
