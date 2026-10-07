'use strict';

jest.mock('../services/session.service', () => ({
  getAdminSession: jest.fn(),
  getCustomerSession: jest.fn(),
  getSuperadminSession: jest.fn(),
}));
jest.mock('../lib/ws-ticket', () => ({ consumeTicket: jest.fn() }));
jest.mock('../lib/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

let connectionHandler;

jest.mock('ws', () => {
  class MockWebSocketServer {
    constructor() {
      this.clients = new Set();
    }

    on(event, handler) {
      if (event === 'connection') connectionHandler = handler;
    }
  }

  return {
    WebSocketServer: MockWebSocketServer,
    WebSocket: { OPEN: 1 },
  };
});

const { init, broadcastSupportChat, getStats } = require('../websocket/ws-server');
const { getCustomerSession } = require('../services/session.service');
const { consumeTicket } = require('../lib/ws-ticket');
const { orgCustomerWsRef, orgStaffWsRef } = require('../lib/platform-constants');

/** Minimal open socket that records every payload it is sent. */
function mockSocket() {
  const sent = [];
  return {
    sent,
    ws: {
      readyState: 1,
      isAlive: true,
      send: jest.fn((payload) => sent.push(JSON.parse(payload))),
      on: jest.fn(),
      ping: jest.fn(),
    },
  };
}

describe('ws-server support chat fanout', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const customerId = 'customer-1';

  beforeEach(() => {
    jest.clearAllMocks();
    connectionHandler = undefined;
    init({});
  });

  it('fans support chat events to org-scoped customer buckets', async () => {
    getCustomerSession.mockResolvedValue({
      id: customerId,
      type: 'customer',
      userId: customerId,
      projectRef: null,
      organizationId: orgId,
    });

    const { ws, sent } = mockSocket();

    await connectionHandler(ws, {
      headers: { cookie: 'customer_session=customer-session' },
      url: '/ws',
    });

    expect(getStats()).toHaveProperty(orgCustomerWsRef(orgId), 1);

    const message = {
      type: 'chat:message',
      conversationId: 'conversation-1',
      message: { id: 'message-1', content: 'hello' },
    };

    expect(broadcastSupportChat('__marketplace_customer__', message, orgId)).toBe(1);
    expect(sent).toContainEqual(expect.objectContaining({ type: 'connected' }));
    expect(sent).toContainEqual(message);
  });

  it('also keeps SaaS org staff support fanout intact', async () => {
    consumeTicket.mockResolvedValue({
      kind: 'saas_org_staff',
      organizationId: orgId,
      clerkUserId: 'clerk-user-1',
      projectRefs: [],
    });

    const { ws, sent } = mockSocket();

    await connectionHandler(ws, { headers: {}, url: '/ws?scope=saas&ticket=ticket-1' });

    // The org-staff sentinel is the primary bucket for a Clerk-authed SaaS
    // connection, so it must appear in the registry for support events to land.
    expect(getStats()).toHaveProperty(orgStaffWsRef(orgId), 1);

    const staffMessage = { type: 'chat:support_status', conversationId: 'conversation-1' };
    broadcastSupportChat(orgStaffWsRef(orgId), staffMessage, orgId);

    expect(sent).toContainEqual(expect.objectContaining({ type: 'connected' }));
    expect(sent).toContainEqual(staffMessage);
  });
});
