'use strict';

const shopReviewModel = require('../models/shop-review.model');
const orderModel = require('../models/order.model');
const { createError } = require('../middleware/error.middleware');

async function createReview(req, res, next) {
  try {
    const { orderId, rating, comment } = req.body;
    const customerId = req.customer?.id;
    if (!customerId) return next(createError('Customer authentication required', 401));

    const order = await orderModel.findById(orderId);
    if (!order) return next(createError('Order not found', 404));
    if (order.customer_id !== customerId) return next(createError('Access denied', 403));
    if (!req.customer?.isMarketplaceCustomer && order.project_ref !== req.projectRef) {
      return next(createError('Access denied', 403));
    }
    if (order.status !== 'completed') return next(createError('Can only review completed orders', 400));
    if (!order.shop_id) return next(createError('Order has no shop to review', 400));

    const existing = await shopReviewModel.findByOrderAndCustomer(orderId, customerId);
    if (existing) return next(createError('Review already exists for this order', 409));

    const review = await shopReviewModel.create({
      projectRef: order.project_ref,
      shopId: order.shop_id,
      orderId,
      customerId,
      rating,
      comment,
    });
    return res.status(201).json({ review });
  } catch (err) {
    next(err);
  }
}

async function getMyOrderReview(req, res, next) {
  try {
    const customerId = req.customer?.id;
    if (!customerId) return next(createError('Customer authentication required', 401));
    const { orderId } = req.params;
    const review = await shopReviewModel.findByOrderAndCustomer(orderId, customerId);
    return res.json({ review });
  } catch (err) {
    next(err);
  }
}

async function listVendorShopReviews(req, res, next) {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const reviews = await shopReviewModel.listByShop(req.shopId, {
      includeHidden: true,
      limit: Number(limit),
      offset: Number(offset),
    });
    const summary = await shopReviewModel.getShopSummary(req.shopId);
    return res.json({ reviews, summary });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createReview,
  getMyOrderReview,
  listVendorShopReviews,
};
