'use strict';

const pushTokenModel = require('../models/push-token.model');
const { getCallerId, getCallerRole } = require('../middleware/auth.middleware');
const { MARKETPLACE_CUSTOMER_SCOPE, PLATFORM_RIDER_WS_REF } = require('../lib/platform-constants');

async function registerToken(req, res, next) {
  try {
    const { token, platform } = req.body;
    const userId = getCallerId(req);
    const userRole = getCallerRole(req);

    let projectRef = req.projectRef;
    if (!projectRef && userRole === 'customer' && req.customer?.isMarketplaceCustomer) {
      projectRef = MARKETPLACE_CUSTOMER_SCOPE;
    }
    if (!projectRef && userRole === 'rider' && req.user?.isPlatformRider) {
      projectRef = PLATFORM_RIDER_WS_REF;
    }
    if (!projectRef) {
      return res.status(400).json({ error: 'Project reference is required' });
    }

    await pushTokenModel.upsert({ userId, userRole, token, platform, projectRef });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function unregisterToken(req, res, next) {
  try {
    const userId = getCallerId(req);
    const { platform } = req.query;
    await pushTokenModel.removeToken(userId, platform);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { registerToken, unregisterToken };
