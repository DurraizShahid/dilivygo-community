'use strict';

const ratingModel = require('../models/rating.model');
const orderModel = require('../models/order.model');
const { createError } = require('../middleware/error.middleware');
const { getCallerId } = require('../middleware/auth.middleware');

async function createRating(req, res, next) {
  try {
    const { orderId, toUserId, toRole, rating, comment } = req.body;
    const fromUserId = getCallerId(req);

    const order = await orderModel.findById(orderId);
    if (!order) return next(createError('Order not found', 404));
    if (order.status !== 'completed') {
      return next(createError('Can only rate completed orders', 400));
    }

    const created = await ratingModel.create({
      orderId,
      fromUserId,
      toUserId,
      toRole,
      rating,
      comment,
    });

    return res.status(201).json({ rating: created });
  } catch (err) {
    next(err);
  }
}

async function getOrderRatings(req, res, next) {
  try {
    const { orderId } = req.params;
    const ratings = await ratingModel.findByOrder(orderId);
    return res.json({ ratings });
  } catch (err) {
    next(err);
  }
}

async function getUserRatings(req, res, next) {
  try {
    const { userId } = req.params;
    const [ratings, average] = await Promise.all([
      ratingModel.findByUser(userId),
      ratingModel.averageForUser(userId),
    ]);
    return res.json({ ratings, average });
  } catch (err) {
    next(err);
  }
}

module.exports = { createRating, getOrderRatings, getUserRatings };
