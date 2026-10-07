'use strict';

const config = require('../config');
const { select, update } = require('../lib/supabase');
const logger = require('../lib/logger');
const {
  createConnectExpressAccount,
  createConnectAccountLink,
  retrieveConnectAccount,
} = require('./stripe.service');

function connectReturnPaths(kind, req) {
  const fallback =
    kind === 'superadmin'
      ? String(config.appUrls?.superadmin || 'http://localhost:3003').replace(/\/$/, '')
      : String(config.appUrls?.vendor || 'http://localhost:3001').replace(/\/$/, '');
  if (req) {
    const base = config.getPublicServerUrl ? config.getPublicServerUrl(req) : null;
    if (base) {
      return {
        returnUrl: `${base}/stripe-connect?return=1`,
        refreshUrl: `${base}/stripe-connect?refresh=1`,
      };
    }
  }
  return {
    returnUrl: `${fallback}/stripe-connect?return=1`,
    refreshUrl: `${fallback}/stripe-connect?refresh=1`,
  };
}

function mapAccountFlags(acct) {
  return {
    stripe_connect_charges_enabled: Boolean(acct.charges_enabled),
    stripe_connect_payouts_enabled: Boolean(acct.payouts_enabled),
    stripe_connect_details_submitted: Boolean(acct.details_submitted),
  };
}

/**
 * Phase 04 — Connect onboarding lifecycle.
 *
 * Internal onboarding states (derived at read time from the Stripe account
 * object + cached workspace flags; never persisted as KYC blobs):
 *
 *   not_started    — no connected account exists for the workspace yet.
 *   pending        — onboarding started / details submitted, Stripe reviewing.
 *   action_required— Stripe lists outstanding requirements (currently_due /
 *                    past_due non-empty); the vendor must act in Express.
 *   active         — charges_enabled && payouts_enabled.
 *   restricted     — payouts (or transfers capability) blocked while the
 *                    account otherwise exists (classic Stripe "restricted").
 *   disabled       — requirements.disabled_reason is set; re-onboarding or
 *                    platform intervention required.
 *
 * Allowed transitions (enforced by `isOnboardingTransitionAllowed`, used by
 * tests and the reconciliation job; the sync path below only ever writes
 * derived booleans, so illegal transitions cannot corrupt stored state):
 *
 *   not_started    -> pending
 *   pending        -> action_required | active | disabled
 *   action_required-> pending | active | restricted | disabled
 *   active         -> action_required | restricted | disabled
 *   restricted     -> action_required | active | disabled
 *   disabled       -> action_required | pending
 */
const ONBOARDING_STATES = {
  NOT_STARTED: 'not_started',
  PENDING: 'pending',
  ACTION_REQUIRED: 'action_required',
  ACTIVE: 'active',
  RESTRICTED: 'restricted',
  DISABLED: 'disabled',
};

const ONBOARDING_TRANSITIONS = {
  not_started: ['pending'],
  pending: ['action_required', 'active', 'disabled'],
  action_required: ['pending', 'active', 'restricted', 'disabled'],
  active: ['action_required', 'restricted', 'disabled'],
  restricted: ['action_required', 'active', 'disabled'],
  disabled: ['action_required', 'pending'],
};

function isOnboardingTransitionAllowed(from, to) {
  if (from === to) return true;
  const allowed = ONBOARDING_TRANSITIONS[String(from)] || [];
  return allowed.includes(String(to));
}

function asFieldNameList(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string' && v.length > 0).slice(0, limit);
}

/**
 * Redacted requirements summary. Returns Stripe field NAMES only
 * (e.g. "individual.dob.day") — never values, documents, or PII.
 */
function summarizeRequirements(acct) {
  const req = (acct && acct.requirements) || {};
  const currentlyDue = asFieldNameList(req.currently_due);
  const pastDue = asFieldNameList(req.past_due);
  const disabledReason = typeof req.disabled_reason === 'string' ? req.disabled_reason : null;
  const deadline = req.current_deadline != null ? Number(req.current_deadline) : null;
  return {
    currentlyDue,
    pastDue,
    disabledReason,
    currentDeadline: Number.isFinite(deadline) ? deadline : null,
    outstandingCount: currentlyDue.length + pastDue.length,
  };
}

/**
 * Pure mapper: Stripe account (+ cached flags fallback) -> onboarding state.
 * Accepts either a raw Stripe account object or a pre-flattened flags object
 * so callers without Stripe credentials still get a best-effort state from
 * cached workspace booleans.
 */
function mapOnboardingState(input) {
  const acct = input || {};
  const accountId = acct.accountId || acct.id || null;
  if (!accountId && acct.hasAccount === false) return ONBOARDING_STATES.NOT_STARTED;
  if (!accountId && !('charges_enabled' in acct) && !('chargesEnabled' in acct)) {
    return ONBOARDING_STATES.NOT_STARTED;
  }
  const chargesEnabled = Boolean(acct.charges_enabled ?? acct.chargesEnabled);
  const payoutsEnabled = Boolean(acct.payouts_enabled ?? acct.payoutsEnabled);
  const detailsSubmitted = Boolean(acct.details_submitted ?? acct.detailsSubmitted);
  const req = acct.requirements || {};
  const currentlyDue = Array.isArray(req.currently_due) ? req.currently_due : (Array.isArray(req.currentlyDue) ? req.currentlyDue : []);
  const pastDue = Array.isArray(req.past_due) ? req.past_due : (Array.isArray(req.pastDue) ? req.pastDue : []);
  const disabledReason = req.disabled_reason ?? req.disabledReason ?? null;
  const transfersCapability = acct?.capabilities?.transfers;

  if (disabledReason) return ONBOARDING_STATES.DISABLED;
  if (chargesEnabled && payoutsEnabled) return ONBOARDING_STATES.ACTIVE;
  if (!payoutsEnabled && (chargesEnabled || transfersCapability === 'inactive') && detailsSubmitted) {
    return ONBOARDING_STATES.RESTRICTED;
  }
  if (pastDue.length > 0 || currentlyDue.length > 0) return ONBOARDING_STATES.ACTION_REQUIRED;
  return ONBOARDING_STATES.PENDING;
}

/**
 * Actionable, non-KYC error code for vendor/superadmin surfaces.
 * Returns null when the account is active (nothing to do).
 */
function actionableErrorForState(state, requirementsSummary) {
  const summary = requirementsSummary || { currentlyDue: [], pastDue: [], disabledReason: null };
  switch (String(state)) {
    case ONBOARDING_STATES.NOT_STARTED:
      return { code: 'connect_not_started', message: 'No Stripe Connect account yet. Start onboarding to receive payouts.' };
    case ONBOARDING_STATES.PENDING:
      return { code: 'connect_onboarding_pending', message: 'Onboarding submitted and under Stripe review. No action needed yet.' };
    case ONBOARDING_STATES.ACTION_REQUIRED: {
      const fields = [...(summary.pastDue || []), ...(summary.currentlyDue || [])].slice(0, 5);
      return {
        code: 'connect_action_required',
        message: fields.length
          ? `Stripe needs ${fields.length} item(s): ${fields.join(', ')}. Re-open onboarding to complete them.`
          : 'Stripe needs additional verification. Re-open onboarding to complete it.',
        fields,
      };
    }
    case ONBOARDING_STATES.RESTRICTED:
      return { code: 'connect_restricted', message: 'Payouts are restricted on this Stripe account. Re-open onboarding to resolve.' };
    case ONBOARDING_STATES.DISABLED:
      return {
        code: 'connect_disabled',
        message: summary.disabledReason
          ? `Stripe account disabled (${summary.disabledReason}). Contact platform support.`
          : 'Stripe account disabled. Contact platform support.',
        reason: summary.disabledReason,
      };
    case ONBOARDING_STATES.ACTIVE:
    default:
      return null;
  }
}

/** States from which the vendor must be offered a fresh onboarding link. */
function needsReonboarding(state) {
  return [ONBOARDING_STATES.ACTION_REQUIRED, ONBOARDING_STATES.RESTRICTED, ONBOARDING_STATES.DISABLED]
    .includes(String(state));
}

/**
 * Fail-closed tenant guard for Connect operations. Pass the caller's
 * organization id (when known, e.g. SaaS proxy / superadmin scoping) and the
 * workspace row; mismatches throw 404 so org A can never operate org B's
 * connected account (and observers cannot probe its existence).
 */
function assertWorkspaceOrganization(workspaceRow, expectedOrganizationId) {
  if (expectedOrganizationId == null || expectedOrganizationId === '') return;
  const actual = workspaceRow ? String(workspaceRow.organization_id || '') : '';
  if (!actual || actual !== String(expectedOrganizationId)) {
    const err = new Error('Workspace not found');
    err.statusCode = 404;
    throw err;
  }
}

async function persistWorkspaceFlags(workspaceId, flags) {
  await update(
    'workspaces',
    {
      ...flags,
      updated_at: new Date().toISOString(),
    },
    { id: workspaceId },
  );
}

/**
 * Refresh Connect capability flags from Stripe onto workspaces row.
 * Kept for existing callers (e.g. payment.controller fulfillment path):
 * persists booleans only and returns the flags, exactly as before.
 */
async function refreshWorkspaceConnectFromStripe(workspaceId, accountId) {
  if (!accountId) return null;
  try {
    const acct = await retrieveConnectAccount(accountId);
    if (!acct) return null;
    const flags = mapAccountFlags(acct);
    await persistWorkspaceFlags(workspaceId, flags);
    return flags;
  } catch (err) {
    logger.warn('Stripe retrieve Connect account failed', { workspaceId, error: err.message });
    return null;
  }
}

/**
 * Retrieve the raw Stripe account for a workspace (server-only).
 * Returns null when Stripe is not configured — callers must fall back to
 * cached workspace flags and never treat "unconfigured" as a vendor fault.
 */
async function retrieveWorkspaceConnectAccount(workspaceId) {
  const rows = await select('workspaces', { filters: { id: workspaceId }, limit: 1 });
  const ws = rows?.[0];
  if (!ws || !ws.stripe_connect_account_id) return { workspace: ws || null, account: null };
  try {
    const account = await retrieveConnectAccount(ws.stripe_connect_account_id);
    return { workspace: ws, account: account || null };
  } catch (err) {
    logger.warn('Stripe retrieve Connect account failed', { workspaceId, error: err.message });
    return { workspace: ws, account: null, error: err.message };
  }
}

/**
 * Sync cached capability flags from Stripe onto the workspace row and return
 * the derived onboarding snapshot. Persists booleans ONLY — requirements
 * field names, disabled reasons and deadlines are derived per-read and never
 * stored (no KYC blobs at rest; no migration needed).
 */
async function syncAccountStatus(workspaceId, options = {}) {
  const { workspace, account, error } = await retrieveWorkspaceConnectAccount(workspaceId);
  if (!workspace) {
    const err = new Error('Workspace not found');
    err.statusCode = 404;
    throw err;
  }
  assertWorkspaceOrganization(workspace, options.expectedOrganizationId);
  if (account) {
    await persistWorkspaceFlags(workspaceId, mapAccountFlags(account));
  }
  const refreshed = (await select('workspaces', { filters: { id: workspaceId }, limit: 1 }))?.[0] || workspace;
  const snapshot = buildOnboardingSnapshot(refreshed, account);
  if (error && !account) snapshot.syncError = 'stripe_account_unreachable';
  return snapshot;
}

/**
 * Called after the vendor returns from Stripe Express onboarding
 * (return_url) or restarts it (refresh_url): re-sync flags from Stripe and
 * report the new state so the UI can show progress without new KYC writes.
 */
async function handleOnboardingReturn(workspaceId, options = {}) {
  return syncAccountStatus(workspaceId, options);
}

function buildOnboardingSnapshot(workspaceRow, stripeAccount) {
  const accountId = workspaceRow?.stripe_connect_account_id || stripeAccount?.id || null;
  let state;
  let requirementsSummary = { currentlyDue: [], pastDue: [], disabledReason: null, currentDeadline: null, outstandingCount: 0 };
  if (stripeAccount) {
    state = mapOnboardingState(stripeAccount);
    requirementsSummary = summarizeRequirements(stripeAccount);
  } else if (!accountId) {
    state = mapOnboardingState({ hasAccount: false });
  } else {
    // Stripe unreachable / unconfigured: best-effort state from cached flags.
    state = mapOnboardingState({
      accountId,
      chargesEnabled: workspaceRow.stripe_connect_charges_enabled,
      payoutsEnabled: workspaceRow.stripe_connect_payouts_enabled,
      detailsSubmitted: workspaceRow.stripe_connect_details_submitted,
    });
    // Cached flags can prove ACTIVE but can never prove the absence of new
    // requirements — surface that uncertainty instead of a fake Healthy.
    if (state === ONBOARDING_STATES.ACTIVE) requirementsSummary = { ...requirementsSummary, fromCache: true };
    else requirementsSummary = { ...requirementsSummary, fromCache: true };
  }
  const actionableError = actionableErrorForState(state, requirementsSummary);
  return {
    accountId,
    chargesEnabled: Boolean(workspaceRow?.stripe_connect_charges_enabled),
    payoutsEnabled: Boolean(workspaceRow?.stripe_connect_payouts_enabled),
    detailsSubmitted: Boolean(workspaceRow?.stripe_connect_details_submitted),
    onboardingState: state,
    actionableError,
    requirementsSummary,
    needsReonboarding: needsReonboarding(state),
    lastSyncedAt: workspaceRow?.updated_at || null,
  };
}

/**
 * Ensure workspace has a Connect Express account id; create if missing.
 */
async function ensureExpressAccountForWorkspace(workspaceRow) {
  const id = workspaceRow.id;
  const existing = workspaceRow.stripe_connect_account_id;
  if (existing) {
    await refreshWorkspaceConnectFromStripe(id, existing);
    return existing;
  }

  const country = String(config.stripeConnectDefaultCountry || 'GB')
    .trim()
    .slice(0, 2)
    .toUpperCase();
  const acct = await createConnectExpressAccount({
    country,
    metadata: {
      workspace_id: id,
      project_ref: String(workspaceRow.project_ref || ''),
    },
  });

  await update(
    'workspaces',
    {
      stripe_connect_account_id: acct.id,
      updated_at: new Date().toISOString(),
    },
    { id },
  );

  await refreshWorkspaceConnectFromStripe(id, acct.id);
  return acct.id;
}

/**
 * @param {'superadmin'|'vendor'} kind
 * @param {object} [options] — optional { expectedOrganizationId } fail-closed tenant guard.
 */
async function createOnboardingLinkForWorkspace(workspaceId, kind, options = {}, reqArg) {
  const req = (options && (options.headers || options.hostContext || options.method)) ? options : (options?.req || reqArg || null);
  const opts = (options && (options.headers || options.hostContext || options.method)) ? {} : options;
  const rows = await select('workspaces', { filters: { id: workspaceId }, limit: 1 });
  const ws = rows?.[0];
  if (!ws) {
    const err = new Error('Workspace not found');
    err.statusCode = 404;
    throw err;
  }
  assertWorkspaceOrganization(ws, opts.expectedOrganizationId);

  const accountId = await ensureExpressAccountForWorkspace(ws);
  const { returnUrl, refreshUrl } = connectReturnPaths(kind, req);
  // Return/refresh flow: Stripe redirects the vendor to returnUrl after a
  // completed onboarding step and to refreshUrl when the link expired or the
  // account needs re-onboarding (action_required/restricted/disabled). Both
  // land on the vendor/superadmin stripe-connect page, which must call
  // GET status (handleOnboardingReturn path) to re-sync — the link itself
  // carries no state and no KYC data.
  const link = await createConnectAccountLink({
    accountId,
    refreshUrl,
    returnUrl,
  });
  const snapshot = buildOnboardingSnapshot(
    (await select('workspaces', { filters: { id: workspaceId }, limit: 1 }))?.[0] || ws,
    null,
  );
  return { url: link.url, accountId, returnUrl, refreshUrl, onboardingState: snapshot.onboardingState };
}

async function getWorkspaceConnectSummary(workspaceId, options = {}) {
  const rows = await select('workspaces', { filters: { id: workspaceId }, limit: 1 });
  const ws = rows?.[0];
  if (!ws) {
    const err = new Error('Workspace not found');
    err.statusCode = 404;
    throw err;
  }
  assertWorkspaceOrganization(ws, options.expectedOrganizationId);
  if (ws.stripe_connect_account_id) {
    await refreshWorkspaceConnectFromStripe(workspaceId, ws.stripe_connect_account_id);
  }
  const refreshed = await select('workspaces', { filters: { id: workspaceId }, limit: 1 });
  const w = refreshed?.[0] || ws;
  // Best-effort live enrichment: when Stripe is reachable, derive the full
  // onboarding snapshot (requirements field names only); otherwise fall back
  // to the cached-flags snapshot so status stays available offline.
  let liveAccount = null;
  if (w.stripe_connect_account_id) {
    try {
      liveAccount = await retrieveConnectAccount(w.stripe_connect_account_id);
    } catch (err) {
      logger.warn('Stripe retrieve Connect account failed', { workspaceId, error: err.message });
    }
  }
  return buildOnboardingSnapshot(w, liveAccount || null);
}

module.exports = {
  ensureExpressAccountForWorkspace,
  createOnboardingLinkForWorkspace,
  getWorkspaceConnectSummary,
  refreshWorkspaceConnectFromStripe,
  retrieveWorkspaceConnectAccount,
  syncAccountStatus,
  handleOnboardingReturn,
  buildOnboardingSnapshot,
  mapAccountFlags,
  connectReturnPaths,
  mapOnboardingState,
  summarizeRequirements,
  actionableErrorForState,
  needsReonboarding,
  isOnboardingTransitionAllowed,
  assertWorkspaceOrganization,
  ONBOARDING_STATES,
  ONBOARDING_TRANSITIONS,
};
