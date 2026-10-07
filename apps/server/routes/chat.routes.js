'use strict';

const { Router } = require('express');
const chatController = require('../controllers/chat.controller');
const { validate } = require('../middleware/validate.middleware');
const { sanitizeBody } = require('../middleware/sanitize.middleware');
const { parseSession, requireAnyAuth, requireCustomer } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');
const v = require('../validators/chat.validator');

const router = Router();

router.use(parseSession);

router.post(
  '/support-tickets',
  attachProjectRef,
  requireProjectRef,
  requireCustomer,
  sanitizeBody('subject', 'message'),
  validate(v.createSupportTicketSchema),
  chatController.createSupportTicket
);

router.use(requireAnyAuth, attachProjectRef, requireProjectRef);

router.post('/conversations',                       validate(v.createConversationSchema),           chatController.createConversation);
router.get('/conversations',                                                                         chatController.listConversations);
router.get('/conversations/:id/messages',           validate(v.listMessagesSchema, 'query'),        chatController.getMessages);
router.post('/conversations/:id/messages',          sanitizeBody('content'), validate(v.sendMessageSchema),                  chatController.sendMessage);
router.patch('/conversations/:id/read',                                                              chatController.markRead);
router.patch(
  '/conversations/:id/support-status',
  validate(v.patchSupportChatClosedSchema),
  chatController.patchSupportChatStatus
);
router.get('/conversations/:id/support-rating', chatController.getSupportRating);
router.put(
  '/conversations/:id/support-rating',
  sanitizeBody('comment'),
  validate(v.putSupportRatingSchema),
  chatController.putSupportRating
);

module.exports = router;
