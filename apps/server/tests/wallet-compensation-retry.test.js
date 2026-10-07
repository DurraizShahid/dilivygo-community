'use strict';

jest.mock('../lib/supabase', () => ({
  supabaseFetch: jest.fn(),
  select: jest.fn(),
}));

const { supabaseFetch, select } = require('../lib/supabase');
const { applyWalletDelta, checkoutIdempotencySuffix } = require('../services/wallet.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('wallet checkout compensation recovery', () => {
  test('extracts checkout debit idempotency suffix only from checkout keys', () => {
    expect(checkoutIdempotencySuffix('checkout_debit:batch-1')).toBe('batch-1');
    expect(checkoutIdempotencySuffix('refund_credit:batch-1')).toBeNull();
  });

  test('normal first debit does not create a recovery debit when no compensation exists', async () => {
    supabaseFetch.mockResolvedValue([{ new_balance: 7000, ledger_id: 'ledger-debit' }]);
    select.mockResolvedValue([]);

    const result = await applyWalletDelta({
      customerId: '11111111-1111-1111-1111-111111111111',
      amountCents: -3000,
      type: 'checkout_debit',
      idempotencyKey: 'checkout_debit:batch-1',
      projectRef: 'workspace-a',
    });

    expect(result.ledgerId).toBe('ledger-debit');
    expect(supabaseFetch).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(
      'customer_wallet_ledger',
      expect.objectContaining({ filters: { idempotency_key: 'checkout_undo:batch-1' } }),
    );
  });

  test('retry after compensation applies one deterministic re-debit', async () => {
    supabaseFetch
      .mockResolvedValueOnce([{ new_balance: 10000, ledger_id: 'ledger-original-debit' }])
      .mockResolvedValueOnce([{ new_balance: 7000, ledger_id: 'ledger-redebit' }]);
    select.mockResolvedValue([{ id: 'undo-ledger', idempotency_key: 'checkout_undo:batch-1' }]);

    const result = await applyWalletDelta({
      customerId: '11111111-1111-1111-1111-111111111111',
      amountCents: -3000,
      type: 'checkout_debit',
      idempotencyKey: 'checkout_debit:batch-1',
      projectRef: 'workspace-a',
      metadata: { paymentIntentId: 'pi_123' },
    });

    expect(result).toEqual({ newBalance: 7000, ledgerId: 'ledger-redebit' });
    expect(supabaseFetch).toHaveBeenCalledTimes(2);
    const recoveryBody = JSON.parse(supabaseFetch.mock.calls[1][1].body);
    expect(recoveryBody).toEqual(expect.objectContaining({
      p_amount_cents: -3000,
      p_type: 'checkout_debit',
      p_idempotency_key: 'checkout_redebit:batch-1',
    }));
    expect(recoveryBody.p_metadata).toEqual(expect.objectContaining({
      recoveryOf: 'checkout_debit:batch-1',
      compensationKey: 'checkout_undo:batch-1',
    }));
  });

  test('recovery debit remains idempotent on later retries', async () => {
    // The DB RPC owns idempotency. A later call may return the same recovery
    // ledger id without changing the balance again.
    supabaseFetch
      .mockResolvedValueOnce([{ new_balance: 7000, ledger_id: 'ledger-original-debit' }])
      .mockResolvedValueOnce([{ new_balance: 7000, ledger_id: 'ledger-redebit' }]);
    select.mockResolvedValue([{ id: 'undo-ledger', idempotency_key: 'checkout_undo:batch-1' }]);

    const result = await applyWalletDelta({
      customerId: '11111111-1111-1111-1111-111111111111',
      amountCents: -3000,
      type: 'checkout_debit',
      idempotencyKey: 'checkout_debit:batch-1',
      projectRef: 'workspace-a',
    });

    expect(result.ledgerId).toBe('ledger-redebit');
    const recoveryBody = JSON.parse(supabaseFetch.mock.calls[1][1].body);
    expect(recoveryBody.p_idempotency_key).toBe('checkout_redebit:batch-1');
  });
});
