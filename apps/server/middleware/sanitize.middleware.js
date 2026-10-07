'use strict';

const { sanitizeText, sanitizeArrayItems } = require('../lib/sanitize');

/**
 * Middleware factory that sanitizes specified fields in req.body before processing.
 * Prevents stored XSS by stripping HTML tags from user input.
 * 
 * @param {...string} fields - Field names to sanitize in req.body
 * @returns {Function} Express middleware
 * 
 * @example
 * // Sanitize 'content' field before storing chat messages
 * router.post('/messages', sanitizeBody('content'), controller.sendMessage);
 * 
 * // Sanitize multiple fields
 * router.post('/orders', sanitizeBody('note', 'reason'), controller.createOrder);
 */
function sanitizeBody(...fields) {
  return (req, res, next) => {
    if (!req.body) return next();
    for (const field of fields) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        req.body[field] = sanitizeText(req.body[field]);
      }
    }
    next();
  };
}

/**
 * Middleware factory that sanitizes text fields in array items within req.body.
 * Useful for endpoints that accept arrays (like order items with notes).
 * 
 * @param {string} arrayField - The field name containing the array in req.body
 * @param {...string} itemFields - Field names to sanitize within each array item
 * @returns {Function} Express middleware
 * 
 * @example
 * // Sanitize 'notes' field in each item of req.body.items
 * router.post('/orders', sanitizeArrayField('items', 'notes', 'name'), controller.createOrder);
 */
function sanitizeArrayField(arrayField, ...itemFields) {
  return (req, res, next) => {
    if (!req.body || !Array.isArray(req.body[arrayField])) return next();
    req.body[arrayField] = sanitizeArrayItems(req.body[arrayField], itemFields);
    next();
  };
}

module.exports = {
  sanitizeBody,
  sanitizeArrayField,
};
