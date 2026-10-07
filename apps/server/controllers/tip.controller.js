'use strict';

const tipModel = require('../models/tip.model');
const { createError } = require('../middleware/error.middleware');

/**
 * Legacy tip creation wrote a payable rider earning without any durable proof
 * that the customer had actually been charged. That is a money-creation path.
 * Keep reads of historical tips available, but fail closed on new digital tips
 * until a paid-tip PaymentIntent/webhook flow supplies immutable payment proof.
 */
async function createTip(req, res, next) {
  return next(createError(
    'Paid tipping is temporarily unavailable until payment capture is completed',
    503,
  ));
}

async function getRiderTips(req, res, next) {
  try {
    const { riderId } = req.params;
    const totals = await tipModel.totalsForRider(riderId);
    return res.json({
      riderId,
      totalCents: totals.riderNetCents,
      grossCents: totals.grossCents,
      platformFeeCents: totals.platformFeeCents,
      riderNetCents: totals.riderNetCents,
    });
  } catch (err) {
    next(err);
  }
}

async function getMyTips(req, res, next) {
  try {
    const riderId = req.user.id;
    const totals = await tipModel.totalsForRider(riderId);
    return res.json({
      riderId,
      totalCents: totals.riderNetCents,
      grossCents: totals.grossCents,
      platformFeeCents: totals.platformFeeCents,
      riderNetCents: totals.riderNetCents,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createTip, getRiderTips, getMyTips };
