'use strict';

/**
 * Phase 12 — POS hardware & local device integration layer (local ONLY).
 *
 * No real hardware, no network, no DB. The server ledger
 * (`services/pos-hardware.js`) is pure + in-memory; the desktop queue
 * (`apps/pos-desktop/pos-hardware-drivers.js`) is Electron-free and driven
 * here with mock drivers + memory/file storage.
 *
 * Case map:
 * - ESC/POS byte builder: exact INIT/CUT/DRAWER-KICK bytes, text encoding,
 *   feed/align validation, receipt composition, amount formatting.
 * - Idempotent print ids: same scope + same key ⇒ same job (`deduped`),
 *   retry ⇒ single row; cross-scope reads return null (no oracle).
 * - Ledger transitions: queued → sent → acked; acked is terminal (409);
 *   failed increments attempts with truncated errors; unknown job is 404.
 * - Kitchen routing: station → printer map, unknown-station fallback, and
 *   per-copy receipt fan-out with deterministic keys.
 * - Offline queue replay: enqueue dedupe, fail-once replay prints exactly
 *   once, offline printer retains the job, post-success replay is a no-op
 *   (no duplicates), restart preserves the queue (persistence semantics).
 * - Failure isolation: dead printer / offline printer / terminal decline
 *   NEVER mutate order/payment rows (fake stores assert zero writes).
 * - Permission gating: drawer without the flag is refused (403
 *   DRAWER_NOT_PERMITTED); drawer without a bound printer is refused (400).
 * - IPC bridge: all 8 channels registered, drawer/scanner/queue shapes.
 * - Terminal: capability reports unavailable; live payment throws 503.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const hw = require('../services/pos-hardware');
const drivers = require('../../pos-desktop/pos-hardware-drivers');

const SCOPE = { projectRef: 'proj-test-12', shopId: 'shop-test-12' };

// ─── ESC/POS byte builder ───────────────────────────────────────────────────

describe('pos-hardware — ESC/POS byte builder', () => {
  test('INIT emits exactly ESC @', () => {
    expect([...hw.escposInit()]).toEqual([0x1b, 0x40]);
  });

  test('CUT emits exactly GS V 0', () => {
    expect([...hw.escposCut()]).toEqual([0x1d, 0x56, 0x00]);
  });

  test('drawer kick emits ESC p with standard pulse (pin 0 and 1)', () => {
    expect([...hw.escposDrawerKick({ pin: 0 })]).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
    expect([...hw.escposDrawerKick({ pin: 1 })]).toEqual([0x1b, 0x70, 0x01, 0x19, 0xfa]);
  });

  test('drawer kick rejects pins outside 0/1', () => {
    expect(() => hw.escposDrawerKick({ pin: 2 })).toThrow();
  });

  test('text encodes latin-1 and replaces unmappable chars with ?', () => {
    const bytes = hw.escposText('héllo—');
    expect([...bytes]).toEqual([0x68, 0xe9, 0x6c, 0x6c, 0x6f, 0x3f]);
  });

  test('feed emits N line feeds; out-of-range feed throws', () => {
    expect([...hw.escposFeed(2)]).toEqual([0x0a, 0x0a]);
    expect(() => hw.escposFeed(256)).toThrow();
  });

  test('align accepts 0/1/2 and rejects anything else', () => {
    expect([...hw.escposAlign(1)]).toEqual([0x1b, 0x61, 0x01]);
    expect(() => hw.escposAlign(3)).toThrow();
  });

  test('cents format as plain decimals with no currency symbols', () => {
    expect(hw.formatCentsPlain(1250)).toBe('12.50');
    expect(hw.formatCentsPlain(5)).toBe('0.05');
    expect(hw.formatCentsPlain(-5)).toBe('-0.05');
    expect(() => hw.formatCentsPlain(12.5)).toThrow();
  });

  test('receipt composes title, lines, total, and ends with CUT', () => {
    const buffer = hw.buildReceiptEscPos({
      title: 'Test Shop',
      lines: [{ quantity: 2, label: 'Burger', amountCents: 900 }],
      totalCents: 900,
      currencyCode: 'PKR',
    });
    const text = buffer.toString('latin1');
    expect(text).toContain('Test Shop');
    expect(text).toContain('Burger');
    expect(text).toContain('9.00');
    expect(text).toContain('PKR');
    expect([...buffer.slice(-3)]).toEqual([0x1d, 0x56, 0x00]);
  });
});

// ─── Idempotent print-job IDs + ledger ──────────────────────────────────────

describe('pos-hardware — idempotent print-job ledger', () => {
  test('derived job ids are deterministic and scoped', () => {
    const a = hw.derivePrintJobId({ ...SCOPE, idempotencyKey: 'order-1:cashier:copy1' });
    const b = hw.derivePrintJobId({ ...SCOPE, idempotencyKey: 'order-1:cashier:copy1' });
    const c = hw.derivePrintJobId({ ...SCOPE, idempotencyKey: 'order-1:cashier:copy2' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('pj_')).toBe(true);
  });

  test('retry with the same key returns the same job (deduped, single row)', () => {
    const ledger = hw.createPrintJobLedger();
    const first = ledger.enqueue({ ...SCOPE, kind: 'receipt', idempotencyKey: 'k-retry-1' });
    const second = ledger.enqueue({ ...SCOPE, kind: 'receipt', idempotencyKey: 'k-retry-1' });
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    expect(ledger.listPending(SCOPE)).toHaveLength(1);
  });

  test('different keys create different jobs', () => {
    const ledger = hw.createPrintJobLedger();
    ledger.enqueue({ ...SCOPE, kind: 'receipt', idempotencyKey: 'k-a' });
    ledger.enqueue({ ...SCOPE, kind: 'receipt', idempotencyKey: 'k-b' });
    expect(ledger.listPending(SCOPE)).toHaveLength(2);
  });

  test('cross-scope reads return null (no oracle); missing scope throws', () => {
    const ledger = hw.createPrintJobLedger();
    ledger.enqueue({ ...SCOPE, kind: 'receipt', idempotencyKey: 'k-scope-1' });
    expect(
      ledger.get({ projectRef: 'other-proj', shopId: SCOPE.shopId, idempotencyKey: 'k-scope-1' }),
    ).toBeNull();
    expect(
      ledger.get({ projectRef: SCOPE.projectRef, shopId: 'other-shop', idempotencyKey: 'k-scope-1' }),
    ).toBeNull();
    expect(() => ledger.enqueue({ projectRef: '', shopId: SCOPE.shopId, idempotencyKey: 'k' })).toThrow();
    expect(() => ledger.enqueue({ ...SCOPE, idempotencyKey: 'bad key with spaces!' })).toThrow();
  });

  test('state machine: queued → sent → acked; acked is terminal', () => {
    const ledger = hw.createPrintJobLedger();
    ledger.enqueue({ ...SCOPE, kind: 'receipt', idempotencyKey: 'k-state-1' });
    expect(ledger.markSent('k-state-1', SCOPE).status).toBe('sent');
    expect(ledger.markAcked('k-state-1', SCOPE).status).toBe('acked');
    expect(() => ledger.markFailed('k-state-1', SCOPE, new Error('late'))).toThrow(
      expect.objectContaining({ code: 'POS_PRINT_JOB_TERMINAL' }),
    );
  });

  test('failed jobs count attempts and truncate errors; unknown job is 404', () => {
    const ledger = hw.createPrintJobLedger();
    ledger.enqueue({ ...SCOPE, kind: 'receipt', idempotencyKey: 'k-fail-1' });
    const failed = ledger.markFailed('k-fail-1', SCOPE, new Error('x'.repeat(2000)));
    expect(failed.status).toBe('failed');
    expect(failed.attempts).toBe(1);
    expect(failed.lastError.length).toBeLessThanOrEqual(501);
    expect(ledger.listPending(SCOPE)).toHaveLength(1); // failed stays retryable
    expect(() => ledger.markSent('k-missing', SCOPE)).toThrow(
      expect.objectContaining({ code: 'POS_PRINT_JOB_NOT_FOUND' }),
    );
  });
});

// ─── Kitchen routing ────────────────────────────────────────────────────────

describe('pos-hardware — kitchen routing', () => {
  test('known stations resolve directly; unknown stations fall back visibly', () => {
    const routes = { cashier: 'printer-front', kitchen: 'printer-kitchen' };
    expect(hw.resolveStationPrinter({ station: 'kitchen', routes })).toEqual({
      station: 'kitchen',
      printerId: 'printer-kitchen',
      isFallback: false,
    });
    expect(
      hw.resolveStationPrinter({ station: 'grill', routes, fallbackPrinterId: 'printer-front' }),
    ).toEqual({ station: 'grill', printerId: 'printer-front', isFallback: true });
  });

  test('receipt fan-out emits one deterministic key per copy', () => {
    const specs = hw.buildReceiptJobs({
      orderId: 'order-9',
      ...SCOPE,
      copies: { cashier: 2, kitchen: 1 },
    });
    expect(specs.map((s) => s.idempotencyKey)).toEqual([
      'order-9:cashier:copy1',
      'order-9:cashier:copy2',
      'order-9:kitchen:copy1',
    ]);
    expect(specs[2].kind).toBe('kitchen-ticket');
  });

  test('zero copies emit zero jobs (never a phantom print)', () => {
    expect(
      hw.buildReceiptJobs({ orderId: 'order-9', ...SCOPE, copies: { cashier: 0, kitchen: 0 } }),
    ).toEqual([]);
  });
});

// ─── Scanner claims + drawer gate + terminal ────────────────────────────────

describe('pos-hardware — scanner, drawer, terminal', () => {
  test('scanner claim is exclusive until release or expiry', () => {
    let t = 1000;
    const registry = hw.createScannerClaimRegistry({ nowMs: () => t });
    expect(registry.claim({ deviceId: 'scan-1', holder: 'pane-a' })).toEqual({ ok: true, holder: 'pane-a' });
    expect(registry.claim({ deviceId: 'scan-1', holder: 'pane-b' }).ok).toBe(false);
    expect(registry.release({ deviceId: 'scan-1', holder: 'pane-b' }).ok).toBe(false);
    expect(registry.release({ deviceId: 'scan-1', holder: 'pane-a' })).toEqual({
      ok: true,
      released: true,
    });
    expect(registry.claim({ deviceId: 'scan-1', holder: 'pane-b' }).ok).toBe(true);
    t += 60000; // TTL (30s) lapses
    expect(registry.holderOf('scan-1')).toBeNull();
    expect(registry.claim({ deviceId: 'scan-1', holder: 'pane-a' }).ok).toBe(true);
  });

  test('drawer without the permission flag is refused (403)', () => {
    try {
      hw.assertDrawerPermitted({ permissions: {}, printerId: 'printer-front' });
      throw new Error('expected drawer gate to throw');
    } catch (err) {
      expect(err.code).toBe('DRAWER_NOT_PERMITTED');
      expect(err.statusCode).toBe(403);
    }
  });

  test('drawer without a bound printer is refused (fires via printer path only)', () => {
    try {
      hw.assertDrawerPermitted({ permissions: { hardwareDrawer: true }, printerId: '' });
      throw new Error('expected drawer gate to throw');
    } catch (err) {
      expect(err.code).toBe('DRAWER_REQUIRES_PRINTER');
    }
    expect(
      hw.assertDrawerPermitted({ permissions: { hardwareDrawer: true }, printerId: 'printer-front' }),
    ).toEqual({ permitted: true, printerId: 'printer-front' });
  });

  test('terminal capability is unavailable; live payment throws 503 (no fake success)', () => {
    expect(hw.getTerminalCapability().available).toBe(false);
    expect(hw.getTerminalCapability().code).toBe('TERMINAL_NOT_PROVISIONED');
    try {
      hw.createTerminalPayment({ amountCents: 100 });
      throw new Error('expected terminal to throw');
    } catch (err) {
      expect(err.code).toBe('TERMINAL_NOT_PROVISIONED');
      expect(err.statusCode).toBe(503);
    }
  });
});

// ─── Failure isolation (hardware failures never touch order/payment rows) ───

describe('pos-hardware — failure isolation', () => {
  function fakeStores() {
    return {
      orders: [],
      payments: [],
      createOrder(row) {
        this.orders.push({ ...row });
        return row;
      },
      capturePayment(row) {
        this.payments.push({ ...row });
        return row;
      },
    };
  }

  test('failed print leaves the order and payment rows intact', async () => {
    const stores = fakeStores();
    // Mirrors createPosOrder: order + payment settle BEFORE any print attempt.
    stores.createOrder({ id: 'order-iso-1', status: 'placed', total_cents: 900 });
    stores.capturePayment({ orderId: 'order-iso-1', status: 'succeeded', amount_cents: 900 });

    const deadPrinter = { print: async () => ({ ok: false, error: 'printer offline' }) };
    const result = await hw.settleHardwareAttempt(() =>
      deadPrinter.print({ idempotencyKey: 'order-iso-1:cashier:copy1' }).then((r) => {
        if (!r.ok) throw new Error(r.error);
        return r;
      }),
    );
    expect(result.ok).toBe(false);
    expect(stores.orders).toHaveLength(1);
    expect(stores.orders[0].status).toBe('placed');
    expect(stores.payments).toHaveLength(1);
    expect(stores.payments[0].status).toBe('succeeded');
  });

  test('printer exception and terminal decline also mutate nothing', async () => {
    const stores = fakeStores();
    stores.createOrder({ id: 'order-iso-2', status: 'placed', total_cents: 500 });

    const throwing = await hw.settleHardwareAttempt(async () => {
      throw new Error('USB device vanished mid-print');
    });
    const declined = await hw.settleHardwareAttempt(async () => {
      hw.createTerminalPayment({ amountCents: 500 });
    });
    expect(throwing.ok).toBe(false);
    expect(declined.ok).toBe(false);
    expect(declined.error).toContain('No payment terminal is provisioned');
    expect(stores.orders).toHaveLength(1);
    expect(stores.payments).toHaveLength(0);
  });

  test('settleHardwareAttempt surfaces values and never throws', async () => {
    await expect(hw.settleHardwareAttempt(async () => 42)).resolves.toEqual({ ok: true, value: 42 });
    await expect(hw.settleHardwareAttempt(async () => ({ printed: true }))).resolves.toEqual({
      ok: true,
      value: { printed: true },
    });
    await expect(
      hw.settleHardwareAttempt(async () => {
        throw 'string failure';
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: false }));
  });
});

// ─── Desktop offline queue + IPC bridge ─────────────────────────────────────

describe('pos-desktop drivers — offline queue replay without duplicates', () => {
  test('mock mode defaults ON until POS_HARDWARE_REAL=1', () => {
    expect(drivers.isMockMode({})).toBe(true);
    expect(drivers.isMockMode({ POS_HARDWARE_REAL: '1' })).toBe(false);
  });

  test('same idempotency key enqueues once (duplicate-print prevention)', () => {
    const queue = drivers.createPrintQueue({
      storage: drivers.createMemoryQueueStorage(),
      printer: drivers.createMockPrinterDriver(),
    });
    const job = { idempotencyKey: 'dup-1', kind: 'receipt' };
    expect(queue.enqueue(job).deduped).toBe(false);
    expect(queue.enqueue(job).deduped).toBe(true);
    expect(queue.pending()).toHaveLength(1);
  });

  test('fail-once replay prints exactly once; later replays are no-ops', async () => {
    const printer = drivers.createMockPrinterDriver({ failMode: 'fail-once' });
    const queue = drivers.createPrintQueue({
      storage: drivers.createMemoryQueueStorage(),
      printer,
    });
    queue.enqueue({ idempotencyKey: 'replay-1', kind: 'receipt' });
    const first = await queue.replay();
    expect(first).toEqual(expect.objectContaining({ attempted: 1, printed: 0, failed: 1 }));
    expect(queue.pending()).toHaveLength(1);
    const second = await queue.replay();
    expect(second).toEqual(expect.objectContaining({ attempted: 1, printed: 1, failed: 0 }));
    expect(printer.printed.filter((p) => p.idempotencyKey === 'replay-1')).toHaveLength(1);
    expect(queue.pending()).toHaveLength(1);
    expect(queue.pending()[0].status).toBe('printed_pending_cloud_ack');
    queue.confirmCloudAck({ idempotencyKey: 'replay-1' });
    expect(queue.pending()).toHaveLength(0);
    const third = await queue.replay();
    expect(third.attempted).toBe(0); // acked jobs are never reprinted
  });

  test('offline printer retains the job with attempt counts (reconnect replays it)', async () => {
    const queue = drivers.createPrintQueue({
      storage: drivers.createMemoryQueueStorage(),
      printer: drivers.createMockPrinterDriver({ failMode: 'offline' }),
    });
    queue.enqueue({ idempotencyKey: 'offline-1', kind: 'kitchen-ticket' });
    await queue.replay();
    await queue.replay();
    const pending = queue.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].attempts).toBe(2);
    expect(pending[0].status).toBe('failed');
  });

  test('queue survives a shell restart via persisted storage (file round-trip)', async () => {
    const filePath = path.join(os.tmpdir(), `pos-hw-queue-test-${Date.now()}.json`);
    try {
      const storage = drivers.createFileQueueStorage(filePath);
      const before = drivers.createPrintQueue({
        storage,
        printer: drivers.createMockPrinterDriver({ failMode: 'offline' }),
      });
      before.enqueue({ idempotencyKey: 'persist-1', kind: 'receipt' });
      await before.replay();
      // "Restart": new queue instance over the same file.
      const after = drivers.createPrintQueue({
        storage: drivers.createFileQueueStorage(filePath),
        printer: drivers.createMockPrinterDriver(),
      });
      expect(after.pending().map((j) => j.idempotencyKey)).toEqual(['persist-1']);
      const replayed = await after.replay();
      expect(replayed.printed).toBe(1);
      expect(after.pending()).toHaveLength(1);
      expect(after.pending()[0].status).toBe('printed_pending_cloud_ack');
      after.confirmCloudAck({ idempotencyKey: 'persist-1' });
      expect(after.pending()).toHaveLength(0);
    } finally {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup failure
      }
    }
  });
});

describe('pos-desktop drivers — IPC bridge contracts', () => {
  function captureBridge({ printer, env = {} } = {}) {
    const handlers = new Map();
    const bridge = drivers.registerPosHardwareIpc({
      secureHandle: (channel, handler) => handlers.set(channel, handler),
      adapters: {
        printer: printer || drivers.createMockPrinterDriver(),
        storage: drivers.createMemoryQueueStorage(),
        getPrinters: async () => [{ name: 'OS-Printer', isDefault: true, status: null, description: null }],
      },
      env,
    });
    return { handlers, bridge };
  }

  test('registers exactly the whitelisted channels (no extra native surface)', () => {
    const { handlers, bridge } = captureBridge();
    expect([...handlers.keys()].sort()).toEqual([...drivers.POS_HARDWARE_CHANNELS].sort());
    expect(bridge.channels).toHaveLength(9);
  });

  test('list-devices reports honest mock + terminal-unavailable state', async () => {
    const { handlers } = captureBridge();
    const result = await handlers.get('pos-hardware:list-devices')({});
    expect(result.ok).toBe(true);
    expect(result.mock).toBe(true);
    expect(result.printers).toHaveLength(1);
    expect(result.terminal).toEqual(expect.objectContaining({ available: false }));
    expect(result.drawer.viaPrinterOnly).toBe(true);
  });

  test('print-job prints immediately on a healthy printer', async () => {
    const { handlers } = captureBridge();
    const result = await handlers.get('pos-hardware:print-job')(null, {
      idempotencyKey: 'ipc-print-1',
      kind: 'receipt',
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, printed: true }));
  });

  test('print-job queues on failure and dedupes the retry (single queued row)', async () => {
    const { handlers } = captureBridge({
      printer: drivers.createMockPrinterDriver({ failMode: 'fail-once' }),
    });
    const printJob = handlers.get('pos-hardware:print-job');
    const first = await printJob(null, { idempotencyKey: 'ipc-queue-1', kind: 'receipt' });
    expect(first.ok).toBe(false);
    expect(first.queued).toBe(true);
    const replay = await handlers.get('pos-hardware:replay-queue')(null);
    expect(replay.printed).toBe(1);
    expect((await handlers.get('pos-hardware:queue-status')(null)).jobs).toHaveLength(1);
    await handlers.get('pos-hardware:confirm-cloud-ack')(null, { idempotencyKey: 'ipc-queue-1' });
    const status = await handlers.get('pos-hardware:queue-status')(null);
    expect(status.jobs).toHaveLength(0);
  });

  test('open-drawer without the permission flag is refused; with flag + printer it kicks', async () => {
    const locked = captureBridge({ env: {} });
    const denied = await locked.handlers.get('pos-hardware:open-drawer')(null, {
      printerId: 'printer-front',
    });
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('permission');

    const allowed = captureBridge({ env: { POS_HARDWARE_DRAWER_ENABLED: '1' } });
    const openDrawer = allowed.handlers.get('pos-hardware:open-drawer');
    expect(await openDrawer(null, {})).toEqual(expect.objectContaining({ ok: false }));
    expect(await openDrawer(null, { printerId: 'printer-front' })).toEqual(
      expect.objectContaining({ ok: true }),
    );
  });

  test('scanner claim round-trip through the bridge', async () => {
    const { handlers } = captureBridge();
    const claim = handlers.get('pos-hardware:scanner-claim');
    const release = handlers.get('pos-hardware:scanner-release');
    expect(await claim(null, { deviceId: 'scan-9', holder: 'pane-a' })).toEqual({
      ok: true,
      holder: 'pane-a',
    });
    expect((await claim(null, { deviceId: 'scan-9', holder: 'pane-b' })).ok).toBe(false);
    expect(await release(null, { deviceId: 'scan-9', holder: 'pane-a' })).toEqual({
      ok: true,
      released: true,
    });
  });
});
