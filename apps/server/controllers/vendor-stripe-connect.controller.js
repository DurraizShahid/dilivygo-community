'use strict';

const { select } = require('../lib/supabase');
const vendorStripeConnectService = require('../services/vendor-stripe-connect.service');

async function resolveWorkspaceId(req) {
  const ref = req.projectRef;
  if (!ref) {
    const err = new Error('Workspace context required');
    err.statusCode = 400;
    throw err;
  }
  const rows = await select('workspaces', { filters: { project_ref: ref }, limit: 1 });
  const ws = rows?.[0];
  if (!ws) {
    const err = new Error('Workspace not found');
    err.statusCode = 404;
    throw err;
  }
  return ws.id;
}

async function postAccountLink(req, res, next) {
  try {
    const workspaceId = await resolveWorkspaceId(req);
     const { url } = await vendorStripeConnectService.createOnboardingLinkForWorkspace(workspaceId, 'vendor', req);
    return res.json({ url });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
}

async function getStatus(req, res, next) {
  try {
    const workspaceId = await resolveWorkspaceId(req);
    const summary = await vendorStripeConnectService.getWorkspaceConnectSummary(workspaceId);
    return res.json(summary);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
}

module.exports = {
  postAccountLink,
  getStatus,
};
