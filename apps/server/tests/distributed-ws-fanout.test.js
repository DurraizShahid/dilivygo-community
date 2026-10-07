'use strict';

const { EventEmitter } = require('events');

const subscriber = new EventEmitter();
subscriber.subscribe = jest.fn().mockResolvedValue(1);
subscriber.unsubscribe = jest.fn().mockResolvedValue(1);
subscriber.quit = jest.fn().mockResolvedValue('OK');

const mockRedis = {
  publish: jest.fn().mockResolvedValue(1),
  duplicate: jest.fn(() => subscriber),
};

jest.mock('../lib/redis', () => ({ getRedis: jest.fn(() => mockRedis) }));
jest.mock('../lib/opaque-id', () => ({ opaqueId: jest.fn(() => 'instance-a') }));

const { installDistributedFanout, CHANNEL } = require('../websocket/distributed-fanout');

function makeWsServer() {
  return {
    broadcast: jest.fn(() => 2),
    fanOrderToWorkspaceAndMarketplaceCustomer: jest.fn(() => 3),
    broadcastSupportChat: jest.fn(() => 4),
    broadcastToRoles: jest.fn(() => 1),
    sendToUser: jest.fn(() => 1),
    isUserOnline: jest.fn(() => true),
  };
}

describe('distributed websocket fanout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    subscriber.removeAllListeners('message');
  });

  test('delivers locally and publishes the same operation to Redis', async () => {
    const wsServer = makeWsServer();
    const originalBroadcast = wsServer.broadcast;
    const handle = await installDistributedFanout(wsServer);

    const count = wsServer.broadcast('workspace-a', { type: 'order:status_changed', orderId: 'o1' });

    expect(count).toBe(2);
    expect(originalBroadcast).toHaveBeenCalledTimes(1);
    expect(mockRedis.publish).toHaveBeenCalledTimes(1);
    const [channel, raw] = mockRedis.publish.mock.calls[0];
    expect(channel).toBe(CHANNEL);
    const event = JSON.parse(raw);
    expect(event).toEqual(expect.objectContaining({
      v: 1,
      origin: 'instance-a',
      method: 'broadcast',
      args: ['workspace-a', { type: 'order:status_changed', orderId: 'o1' }],
    }));

    await handle.shutdown();
  });

  test('replays a sibling instance event through the original local method without republishing', async () => {
    const wsServer = makeWsServer();
    const originalSend = wsServer.sendToUser;
    const handle = await installDistributedFanout(wsServer);

    subscriber.emit('message', CHANNEL, JSON.stringify({
      v: 1,
      origin: 'instance-b',
      method: 'sendToUser',
      args: ['workspace-a', 'user-1', { type: 'chat:message', id: 'm1' }],
    }));

    expect(originalSend).toHaveBeenCalledWith(
      'workspace-a',
      'user-1',
      { type: 'chat:message', id: 'm1' },
    );
    expect(mockRedis.publish).not.toHaveBeenCalled();

    await handle.shutdown();
  });

  test('ignores its own published event to prevent loops', async () => {
    const wsServer = makeWsServer();
    const originalBroadcast = wsServer.broadcast;
    const handle = await installDistributedFanout(wsServer);

    subscriber.emit('message', CHANNEL, JSON.stringify({
      v: 1,
      origin: 'instance-a',
      method: 'broadcast',
      args: ['workspace-a', { type: 'noop' }],
    }));

    expect(originalBroadcast).not.toHaveBeenCalled();
    expect(mockRedis.publish).not.toHaveBeenCalled();

    await handle.shutdown();
  });

  test('does not replace process-local presence checks', async () => {
    const wsServer = makeWsServer();
    const originalPresence = wsServer.isUserOnline;
    const handle = await installDistributedFanout(wsServer);

    expect(wsServer.isUserOnline).toBe(originalPresence);
    await handle.shutdown();
  });
});
