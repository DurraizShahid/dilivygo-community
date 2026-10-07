'use strict';

const { z } = require('zod');
const config = require('../config');

const createConversationSchema = z.object({
  orderId: z.string().uuid(),
  type: z.enum(['customer_vendor', 'vendor_rider', 'customer_rider']),
});

const createSupportTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, 'Subject is required')
    .max(200, 'Subject is too long'),
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(config.chat.maxMessageLength, `Message cannot exceed ${config.chat.maxMessageLength} characters`),
});

const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(config.chat.maxMessageLength, `Message cannot exceed ${config.chat.maxMessageLength} characters`),
});

const listMessagesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
});

const patchSupportChatClosedSchema = z.object({
  closed: z.boolean(),
});

const putSupportRatingSchema = z.object({
  stars: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(500, 'Comment is too long').optional(),
});

const supportRatingsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  organizationId: z.string().uuid().optional(),
});

const supportRatingsSummaryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
  organizationId: z.string().uuid().optional(),
});

module.exports = {
  createConversationSchema,
  createSupportTicketSchema,
  sendMessageSchema,
  listMessagesSchema,
  patchSupportChatClosedSchema,
  putSupportRatingSchema,
  supportRatingsListQuerySchema,
  supportRatingsSummaryQuerySchema,
};
