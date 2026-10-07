'use strict';

const sanitizeHtml = require('sanitize-html');

/**
 * Sanitize a string by removing all HTML tags to prevent XSS attacks.
 * Preserves emoji and unicode characters — only strips HTML.
 * 
 * @param {string} input - The string to sanitize
 * @returns {string} - The sanitized string
 */
function sanitizeText(input) {
  if (typeof input !== 'string') return input;
  return sanitizeHtml(input, {
    allowedTags: [],           // Strip ALL HTML tags
    allowedAttributes: {},     // Strip ALL attributes
    disallowedTagsMode: 'escape', // Escape rather than remove (preserves readable text)
  });
}

/**
 * Sanitize specific fields in an object.
 * 
 * @param {object} obj - The object to sanitize
 * @param {string[]} fields - Array of field names to sanitize
 * @returns {object} - A new object with sanitized fields
 */
function sanitizeObject(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = sanitizeText(result[field]);
    }
  }
  return result;
}

/**
 * Recursively sanitize text fields in an array of objects.
 * Useful for sanitizing arrays like order items with notes fields.
 * 
 * @param {object[]} arr - Array of objects to sanitize
 * @param {string[]} fields - Fields to sanitize in each object
 * @returns {object[]} - New array with sanitized objects
 */
function sanitizeArrayItems(arr, fields) {
  if (!Array.isArray(arr)) return arr;
  return arr.map((item) => sanitizeObject(item, fields));
}

module.exports = {
  sanitizeText,
  sanitizeObject,
  sanitizeArrayItems,
};
