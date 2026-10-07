"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  createPrintQueue,
  createMockPrinterDriver,
  registerPosHardwareIpc,
  isMockMode,
} = require("../pos-hardware-drivers");

function makeTempStorage() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pos-queue-test-"));
  const filePath = path.join(tmpDir, "queue.json");
  return {
    tmpDir,
    filePath,
    load() {
      try {
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        return [];
      }
    },
    save(rows) {
      fs.writeFileSync(filePath, JSON.stringify(rows), "utf8");
    },
    cleanup() {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

test("POS_HARDWARE_REAL=1 requires an explicit real printer adapter", () => {
  // If POS_HARDWARE_REAL=1 and no printer adapter provided, must throw
  assert.throws(
    () => {
      registerPosHardwareIpc({
        secureHandle: () => {},
        env: { POS_HARDWARE_REAL: "1" },
        adapters: {},
      });
    },
    /Real POS hardware requested \(POS_HARDWARE_REAL=1\) but no printer adapter was configured/
  );

  // If real printer adapter is provided, it succeeds
  const bridge = registerPosHardwareIpc({
    secureHandle: () => {},
    env: { POS_HARDWARE_REAL: "1" },
    adapters: {
      printer: {
        async print() {
          return { ok: true };
        },
      },
      storage: { load: () => [], save: () => {} },
    },
  });
  assert.ok(bridge);
  assert.ok(bridge.queue);
});

test("mock mode defaults ON when POS_HARDWARE_REAL is not set", () => {
  assert.equal(isMockMode({}), true);
  assert.equal(isMockMode({ POS_HARDWARE_REAL: "0" }), true);
  assert.equal(isMockMode({ POS_HARDWARE_REAL: "1" }), false);
});

test("persistent queue deduplicates by idempotencyKey", () => {
  const storage = makeTempStorage();
  try {
    const queue = createPrintQueue({
      storage,
      printer: createMockPrinterDriver(),
    });

    const res1 = queue.enqueue({
      idempotencyKey: "idem-key-101",
      cloudJobId: "cloud-job-1",
      shopId: "shop-1",
      projectRef: "proj-1",
      variant: "cashier",
      receiptHtml: "<p>Receipt 1</p>",
    });
    assert.equal(res1.ok, true);
    assert.equal(res1.deduped, false);

    // Second enqueue with same key dedupes without faking physical success
    const res2 = queue.enqueue({
      idempotencyKey: "idem-key-101",
      cloudJobId: "cloud-job-1",
      shopId: "shop-1",
      variant: "cashier",
      receiptHtml: "<p>Receipt 1 duplicate</p>",
    });
    assert.equal(res2.ok, false);
    assert.equal(res2.deduped, true);
    assert.equal(res2.queued, true);
    assert.equal(res2.printed, false);

    const rows = queue.pending();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].idempotencyKey, "idem-key-101");
  } finally {
    storage.cleanup();
  }
});

test("queue replay returns reconciliation metadata for cloud sync", async () => {
  const storage = makeTempStorage();
  try {
    const queue = createPrintQueue({
      storage,
      printer: createMockPrinterDriver(),
    });

    queue.enqueue({
      idempotencyKey: "replay-key-1",
      cloudJobId: "c-job-100",
      shopId: "s-shop-200",
      projectRef: "p-proj-300",
      variant: "kitchen",
      receiptHtml: "<p>Kitchen Ticket</p>",
    });

    const replayRes = await queue.replay();
    assert.equal(replayRes.printed, 1);
    assert.equal(replayRes.failed, 0);
    assert.equal(replayRes.results.length, 1);

    const first = replayRes.results[0];
    assert.equal(first.idempotencyKey, "replay-key-1");
    assert.equal(first.cloudJobId, "c-job-100");
    assert.equal(first.shopId, "s-shop-200");
    assert.equal(first.projectRef, "p-proj-300");
    assert.equal(first.printed, true);

    // Job is preserved in pending as printed_pending_cloud_ack until cloud ACK
    assert.equal(queue.pending().length, 1);
    assert.equal(queue.pending()[0].status, "printed_pending_cloud_ack");

    // Cloud ACK confirmation moves it to reconciled tombstones
    const ackRes = queue.confirmCloudAck({ idempotencyKey: "replay-key-1", cloudJobId: "c-job-100" });
    assert.equal(ackRes.ok, true);
    assert.equal(ackRes.reconciled, true);
    assert.equal(queue.pending().length, 0);
    assert.equal(queue.tombstones().length, 1);
  } finally {
    storage.cleanup();
  }
});

test("failed print keeps job in queue with attempt count and error metadata", async () => {
  const storage = makeTempStorage();
  let failCount = 0;
  try {
    const failingPrinter = {
      async print() {
        failCount += 1;
        return { ok: false, error: "Out of paper" };
      },
    };

    const queue = createPrintQueue({
      storage,
      printer: failingPrinter,
    });

    queue.enqueue({
      idempotencyKey: "fail-key-1",
      cloudJobId: "cloud-fail-1",
      shopId: "shop-fail-1",
      variant: "cashier",
      receiptHtml: "<p>Test</p>",
    });

    const replayRes = await queue.replay();
    assert.equal(replayRes.printed, 0);
    assert.equal(replayRes.failed, 1);

    const first = replayRes.results[0];
    assert.equal(first.idempotencyKey, "fail-key-1");
    assert.equal(first.cloudJobId, "cloud-fail-1");
    assert.equal(first.shopId, "shop-fail-1");
    assert.equal(first.printed, false);
    assert.equal(first.attempts, 1);
    assert.match(first.error, /Out of paper/);

    // Job remains in persistent queue
    const remaining = queue.pending();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].attempts, 1);
  } finally {
    storage.cleanup();
  }
});

test("queue survives shell process restart via disk storage", () => {
  const storage = makeTempStorage();
  try {
    // Session 1: Enqueue job
    const queue1 = createPrintQueue({
      storage,
      printer: createMockPrinterDriver(),
    });
    queue1.enqueue({
      idempotencyKey: "restart-key-1",
      cloudJobId: "cloud-restart-1",
      shopId: "shop-1",
      variant: "cashier",
      receiptHtml: "<p>Persisted</p>",
    });

    // Session 2: Instantiate new queue from same storage
    const queue2 = createPrintQueue({
      storage,
      printer: createMockPrinterDriver(),
    });
    const loaded = queue2.pending();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].idempotencyKey, "restart-key-1");
    assert.equal(loaded[0].cloudJobId, "cloud-restart-1");
  } finally {
    storage.cleanup();
  }
});

test("IPC bridge pos-hardware:print-job returns cloudJobId and shopId", async () => {
  const handlers = new Map();
  const secureHandle = (channel, fn) => {
    handlers.set(channel, fn);
  };

  const storage = makeTempStorage();
  try {
    registerPosHardwareIpc({
      secureHandle,
      env: {},
      adapters: {
        printer: createMockPrinterDriver(),
        storage,
      },
    });

    const printHandler = handlers.get("pos-hardware:print-job");
    assert.equal(typeof printHandler, "function");

    const result = await printHandler(null, {
      idempotencyKey: "ipc-test-key-1",
      cloudJobId: "cloud-ipc-1",
      shopId: "shop-ipc-1",
      projectRef: "proj-ipc-1",
      variant: "cashier",
      receiptHtml: "<p>IPC Print</p>",
    });

    assert.equal(result.ok, true);
    assert.equal(result.printed, true);
    assert.equal(result.idempotencyKey, "ipc-test-key-1");
    assert.equal(result.cloudJobId, "cloud-ipc-1");
    assert.equal(result.shopId, "shop-ipc-1");
  } finally {
    storage.cleanup();
  }
});

test("cloud failure after physical success preserves job without reprint (11-step lifecycle)", async () => {
  const storage = makeTempStorage();
  let printCallCount = 0;
  const trackingPrinter = {
    async print() {
      printCallCount += 1;
      return { ok: true, deviceName: "Receipt-Printer-1" };
    },
  };

  try {
    // Step 1: Enqueue print job
    const queue1 = createPrintQueue({
      storage,
      printer: trackingPrinter,
    });
    const enq = queue1.enqueue({
      idempotencyKey: "cloud-fail-flow-1",
      cloudJobId: "cloud-101",
      shopId: "shop-101",
      projectRef: "proj-101",
      variant: "cashier",
      receiptHtml: "<p>Order #101</p>",
    });
    assert.equal(enq.ok, true);

    // Step 2: Physical printer succeeds
    const rep1 = await queue1.replay();
    assert.equal(rep1.printed, 1);
    assert.equal(printCallCount, 1);

    // Step 3: Local state becomes printed_pending_cloud_ack and receiptHtml is stripped
    const pending1 = queue1.pending();
    assert.equal(pending1.length, 1);
    assert.equal(pending1[0].status, "printed_pending_cloud_ack");
    assert.equal(pending1[0].receiptHtml, undefined);

    // Step 4: Simulate cloud ACK failure (confirmCloudAck is NOT called)

    // Step 5: Restart / recreate queue from disk storage
    const queue2 = createPrintQueue({
      storage,
      printer: trackingPrinter,
    });

    // Step 6: Verify row remains in persistent queue with printed_pending_cloud_ack
    const pending2 = queue2.pending();
    assert.equal(pending2.length, 1);
    assert.equal(pending2[0].idempotencyKey, "cloud-fail-flow-1");
    assert.equal(pending2[0].status, "printed_pending_cloud_ack");

    // Step 7: Replay MUST NOT call printer again
    const rep2 = await queue2.replay();
    assert.equal(rep2.attempted, 0); // No physical execution attempted
    assert.equal(printCallCount, 1); // Still exactly 1 call
    assert.equal(rep2.reconciliationPending.length, 1);
    assert.equal(rep2.reconciliationPending[0].needsCloudAck, true);

    // Step 8: Cloud ACK retry succeeds -> confirm local record
    const confirmRes = queue2.confirmCloudAck({
      idempotencyKey: "cloud-fail-flow-1",
      cloudJobId: "cloud-101",
    });
    assert.equal(confirmRes.ok, true);
    assert.equal(confirmRes.reconciled, true);

    // Step 9: Local row becomes reconciled (tombstone)
    assert.equal(queue2.pending().length, 0);
    assert.equal(queue2.tombstones().length, 1);
    assert.equal(queue2.tombstones()[0].status, "reconciled");

    // Step 10: Same idempotency key submitted again
    const duplicateRes = queue2.enqueue({
      idempotencyKey: "cloud-fail-flow-1",
      cloudJobId: "cloud-101",
      shopId: "shop-101",
      variant: "cashier",
      receiptHtml: "<p>Duplicate attempt</p>",
    });
    assert.equal(duplicateRes.ok, true);
    assert.equal(duplicateRes.deduped, true);
    assert.equal(duplicateRes.printed, true);
    assert.equal(duplicateRes.reconciled, true);

    // Step 11: Physical printer call count remains exactly 1!
    assert.equal(printCallCount, 1);
  } finally {
    storage.cleanup();
  }
});

test("deduped failed job does not fake physical success", async () => {
  const storage = makeTempStorage();
  let printCallCount = 0;
  const failingPrinter = {
    async print() {
      printCallCount += 1;
      return { ok: false, error: "Printer jammed" };
    },
  };

  try {
    const queue = createPrintQueue({
      storage,
      printer: failingPrinter,
    });

    queue.enqueue({
      idempotencyKey: "fail-dedupe-key-1",
      cloudJobId: "cloud-fail-1",
      shopId: "shop-1",
      variant: "cashier",
      receiptHtml: "<p>Fail print</p>",
    });

    const rep1 = await queue.replay();
    assert.equal(rep1.printed, 0);
    assert.equal(rep1.failed, 1);
    assert.equal(printCallCount, 1);

    // Re-enqueueing the failed job must NOT report physical success or ok: true
    const secondEnqueue = queue.enqueue({
      idempotencyKey: "fail-dedupe-key-1",
      cloudJobId: "cloud-fail-1",
      shopId: "shop-1",
      variant: "cashier",
      receiptHtml: "<p>Fail print retry</p>",
    });
    assert.equal(secondEnqueue.ok, false);
    assert.equal(secondEnqueue.deduped, true);
    assert.equal(secondEnqueue.queued, true);
    assert.equal(secondEnqueue.printed, false);

    // Printer was not called during pure enqueue dedupe
    assert.equal(printCallCount, 1);
  } finally {
    storage.cleanup();
  }
});

test("local reconciled tombstone survives app restart and prevents duplicate print", async () => {
  const storage = makeTempStorage();
  let printCallCount = 0;
  const trackingPrinter = {
    async print() {
      printCallCount += 1;
      return { ok: true };
    },
  };

  try {
    const queue1 = createPrintQueue({
      storage,
      printer: trackingPrinter,
    });
    queue1.enqueue({
      idempotencyKey: "tombstone-restart-1",
      cloudJobId: "cloud-tomb-1",
      shopId: "shop-1",
      variant: "cashier",
      receiptHtml: "<p>Original Print</p>",
    });
    await queue1.replay();
    queue1.confirmCloudAck({ idempotencyKey: "tombstone-restart-1" });
    assert.equal(printCallCount, 1);

    // Restart queue from storage
    const queue2 = createPrintQueue({
      storage,
      printer: trackingPrinter,
    });
    assert.equal(queue2.pending().length, 0);
    assert.equal(queue2.tombstones().length, 1);

    // Enqueueing the same key on restarted queue
    const res = queue2.enqueue({
      idempotencyKey: "tombstone-restart-1",
      cloudJobId: "cloud-tomb-1",
      shopId: "shop-1",
      variant: "cashier",
      receiptHtml: "<p>Original Print</p>",
    });
    assert.equal(res.ok, true);
    assert.equal(res.deduped, true);
    assert.equal(res.printed, true);
    assert.equal(res.reconciled, true);
    // Printer was not invoked
    assert.equal(printCallCount, 1);
  } finally {
    storage.cleanup();
  }
});

test("receiptHtml is stripped upon physical success and absent from tombstones", async () => {
  const storage = makeTempStorage();
  try {
    const queue = createPrintQueue({
      storage,
      printer: createMockPrinterDriver(),
    });

    queue.enqueue({
      idempotencyKey: "strip-html-key-1",
      cloudJobId: "cloud-strip-1",
      shopId: "shop-1",
      variant: "cashier",
      receiptHtml: "<html><body>Very large and sensitive HTML receipt</body></html>",
    });

    // Before print: HTML is present for physical execution
    assert.ok(queue.pending()[0].receiptHtml);

    // Print execution
    await queue.replay();

    // After physical success: receiptHtml MUST be stripped
    const printedRow = queue.pending()[0];
    assert.equal(printedRow.status, "printed_pending_cloud_ack");
    assert.equal(printedRow.receiptHtml, undefined);

    // After cloud ACK: tombstone also MUST NOT contain receiptHtml
    queue.confirmCloudAck({ idempotencyKey: "strip-html-key-1" });
    const tombstone = queue.tombstones()[0];
    assert.equal(tombstone.receiptHtml, undefined);
  } finally {
    storage.cleanup();
  }
});

test("tombstone retention policy prunes after 7 days and enforces max 1,000 bounds", () => {
  const storage = makeTempStorage();
  try {
    const nowMs = Date.now();
    const rows = [];

    // Create 1,005 reconciled tombstones
    for (let i = 0; i < 1005; i++) {
      rows.push({
        idempotencyKey: `tomb-${i}`,
        status: "reconciled",
        reconciledAt: new Date(nowMs - i * 1000).toISOString(),
      });
    }

    // Add 1 expired tombstone older than 7 days (8 days old)
    rows.push({
      idempotencyKey: "expired-tomb-old",
      status: "reconciled",
      reconciledAt: new Date(nowMs - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });

    storage.save(rows);

    const queue = createPrintQueue({
      storage,
      printer: createMockPrinterDriver(),
      now: () => new Date(nowMs).toISOString(),
    });

    queue.pruneTombstones();
    const tombstones = queue.tombstones();

    // Expired tombstone must be pruned
    assert.ok(!tombstones.some((t) => t.idempotencyKey === "expired-tomb-old"));
    // Count must be capped to max 1,000
    assert.equal(tombstones.length <= 1000, true);
  } finally {
    storage.cleanup();
  }
});

test("IPC bridge pos-hardware:confirm-cloud-ack transitions local queue to reconciled", async () => {
  const handlers = new Map();
  const secureHandle = (channel, fn) => {
    handlers.set(channel, fn);
  };
  const storage = makeTempStorage();

  try {
    registerPosHardwareIpc({
      secureHandle,
      env: {},
      adapters: {
        printer: createMockPrinterDriver(),
        storage,
      },
    });

    const printHandler = handlers.get("pos-hardware:print-job");
    const confirmHandler = handlers.get("pos-hardware:confirm-cloud-ack");
    const queueStatusHandler = handlers.get("pos-hardware:queue-status");

    const printRes = await printHandler(null, {
      idempotencyKey: "ipc-ack-key-1",
      cloudJobId: "cloud-ack-1",
      shopId: "shop-ack-1",
      variant: "cashier",
      receiptHtml: "<p>To Ack</p>",
    });
    assert.equal(printRes.ok, true);
    assert.equal(printRes.printed, true);
    assert.equal(printRes.needsCloudAck, true);

    const pendingBefore = await queueStatusHandler(null);
    assert.equal(pendingBefore.jobs.length, 1);

    const confirmRes = await confirmHandler(null, {
      idempotencyKey: "ipc-ack-key-1",
      cloudJobId: "cloud-ack-1",
    });
    assert.equal(confirmRes.ok, true);
    assert.equal(confirmRes.reconciled, true);

    const pendingAfter = await queueStatusHandler(null);
    assert.equal(pendingAfter.jobs.length, 0);
  } finally {
    storage.cleanup();
  }
});
