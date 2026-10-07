'use strict';

const mockIsParticipant = jest.fn();

jest.mock('../models/conversation.model', () => ({
  isParticipant: (...args) => mockIsParticipant(...args),
}));

jest.mock('../lib/supabase', () => ({
  select: jest.fn(),
}));

const db = require('../lib/supabase');
const { wsIdentityMayRelayTyping } = require('../lib/chat-ws-access');

const ORDER_ID = 'a1000000-0000-0000-0000-000000000001';

describe('chat-ws-access wsIdentityMayRelayTyping', () => {
  beforeEach(() => {
    mockIsParticipant.mockReset();
    db.select.mockReset();
  });

  it('allows typing when identity is a stored participant', async () => {
    mockIsParticipant.mockReturnValue(true);
    const conv = { type: 'customer_vendor', order_id: ORDER_ID, participant_1_id: 'c1', participant_2_id: 'v1' };
    const ok = await wsIdentityMayRelayTyping({ id: 'c1', type: 'customer' }, conv);
    expect(ok).toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('denies non-participant customer on order chat', async () => {
    mockIsParticipant.mockReturnValue(false);
    db.select.mockResolvedValue([]);
    const conv = { type: 'customer_vendor', order_id: ORDER_ID };
    const ok = await wsIdentityMayRelayTyping({ id: 'other-customer', type: 'customer' }, conv);
    expect(ok).toBe(false);
  });

  it('allows assigned rider extended access on customer_vendor', async () => {
    mockIsParticipant.mockReturnValue(false);
    db.select.mockResolvedValue([{ rider_id: 'r1', order_id: ORDER_ID }]);
    const conv = { type: 'customer_vendor', order_id: ORDER_ID };
    const ok = await wsIdentityMayRelayTyping({ id: 'r1', role: 'rider', type: 'admin' }, conv);
    expect(ok).toBe(true);
  });

  it('allows superadmin typing on customer_support', async () => {
    mockIsParticipant.mockReturnValue(false);
    const conv = { type: 'customer_support', order_id: null };
    const ok = await wsIdentityMayRelayTyping(
      { id: 'sa1', role: 'superadmin', type: 'superadmin' },
      conv
    );
    expect(ok).toBe(true);
  });

  it('allows assigned rider extended access on customer_rider', async () => {
    mockIsParticipant.mockReturnValue(false);
    db.select.mockResolvedValue([{ rider_id: 'r1', order_id: ORDER_ID }]);
    const conv = { type: 'customer_rider', order_id: ORDER_ID };
    const ok = await wsIdentityMayRelayTyping({ id: 'r1', role: 'rider', type: 'admin' }, conv);
    expect(ok).toBe(true);
  });
});
