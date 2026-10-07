'use strict';

const { relayChatTypingFromClient } = require('../lib/chat-typing-relay');

const mockFindById = jest.fn();
const mockMayRelay = jest.fn();

jest.mock('../models/conversation.model', () => ({
  findById: (...a) => mockFindById(...a),
}));

jest.mock('../lib/chat-ws-access', () => ({
  wsIdentityUserId: jest.fn(() => 'u-actor'),
  wsIdentityMayRelayTyping: (...a) => mockMayRelay(...a),
}));

describe('relayChatTypingFromClient', () => {
  beforeEach(() => {
    mockFindById.mockReset();
    mockMayRelay.mockReset();
  });

  it('does not broadcast when conversation is missing', async () => {
    const broadcast = jest.fn();
    const broadcastSupportChat = jest.fn();
    mockFindById.mockResolvedValue(null);

    const r = await relayChatTypingFromClient(
      { id: 'u-actor' },
      { conversationId: 'c1', isTyping: true },
      { broadcast, broadcastSupportChat }
    );

    expect(r).toEqual({ ok: false, reason: 'no_conversation' });
    expect(broadcast).not.toHaveBeenCalled();
    expect(broadcastSupportChat).not.toHaveBeenCalled();
  });

  it('does not broadcast when access helper denies', async () => {
    const broadcast = jest.fn();
    const broadcastSupportChat = jest.fn();
    mockFindById.mockResolvedValue({
      type: 'customer_vendor',
      project_ref: 'pref',
      order_id: 'o1',
    });
    mockMayRelay.mockResolvedValue(false);

    const r = await relayChatTypingFromClient(
      { id: 'intruder' },
      { conversationId: 'c1', isTyping: true },
      { broadcast, broadcastSupportChat }
    );

    expect(r).toEqual({ ok: false, reason: 'denied' });
    expect(broadcast).not.toHaveBeenCalled();
    expect(broadcastSupportChat).not.toHaveBeenCalled();
  });

  it('broadcasts to workspace for order-linked chat', async () => {
    const broadcast = jest.fn(() => 2);
    const broadcastSupportChat = jest.fn();
    mockFindById.mockResolvedValue({
      type: 'customer_rider',
      project_ref: 'pref',
      order_id: 'o1',
    });
    mockMayRelay.mockResolvedValue(true);

    const r = await relayChatTypingFromClient(
      { id: 'u-actor' },
      { conversationId: 'c1', isTyping: true },
      { broadcast, broadcastSupportChat }
    );

    expect(r).toEqual({ ok: true });
    expect(broadcast).toHaveBeenCalledWith('pref', {
      type: 'chat:typing',
      conversationId: 'c1',
      userId: 'u-actor',
      isTyping: true,
    });
    expect(broadcastSupportChat).not.toHaveBeenCalled();
  });

  it('uses support broadcast for customer_support', async () => {
    const broadcast = jest.fn();
    const broadcastSupportChat = jest.fn(() => 1);
    mockFindById.mockResolvedValue({
      type: 'customer_support',
      project_ref: 'pref',
      order_id: null,
    });
    mockMayRelay.mockResolvedValue(true);

    const r = await relayChatTypingFromClient(
      { id: 'u-actor' },
      { conversationId: 't1', isTyping: false },
      { broadcast, broadcastSupportChat }
    );

    expect(r).toEqual({ ok: true });
    expect(broadcastSupportChat).toHaveBeenCalledWith(
      'pref',
      {
        type: 'chat:typing',
        conversationId: 't1',
        userId: 'u-actor',
        isTyping: false,
      },
      undefined
    );
    expect(broadcast).not.toHaveBeenCalled();
  });
});
