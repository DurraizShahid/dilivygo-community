const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("dilivygo:pos-receipt", (event) => {
  const detail = event?.detail || {};
  if (!detail?.shouldPrint) {
    window.dispatchEvent(
      new CustomEvent("dilivygo:pos-receipt-result", {
        detail: {
          jobId: detail.jobId,
          idempotencyKey: detail.idempotencyKey,
          orderId: detail.orderId,
          variant: detail.variant,
          result: { ok: true, skipped: true },
        },
      })
    );
    return;
  }

  ipcRenderer
    .invoke("pos-hardware:print-job", {
      idempotencyKey: detail.idempotencyKey,
      cloudJobId: detail.jobId,
      shopId: detail.shopId,
      projectRef: detail.projectRef,
      variant: detail.variant,
      receiptHtml: detail.receiptHtml,
    })
    .then((result) => {
      window.dispatchEvent(
        new CustomEvent("dilivygo:pos-receipt-result", {
          detail: {
            jobId: detail.jobId,
            idempotencyKey: detail.idempotencyKey,
            orderId: detail.orderId,
            variant: detail.variant,
            result,
          },
        })
      );
    })
    .catch((err) => {
      window.dispatchEvent(
        new CustomEvent("dilivygo:pos-receipt-result", {
          detail: {
            jobId: detail.jobId,
            idempotencyKey: detail.idempotencyKey,
            orderId: detail.orderId,
            variant: detail.variant,
            result: { ok: false, error: err?.message || "Desktop IPC print failure" },
          },
        })
      );
    });
});

contextBridge.exposeInMainWorld("dilivygoDesktop", {
  platform: process.platform,
  posPrinting: {
    isNativeReceiptPrinting: true,
    interceptsReceiptEvents: true,
    printReceipt: (payload) => ipcRenderer.invoke("pos:print-receipt", payload),
    listPrinters: () => ipcRenderer.invoke("pos:list-printers"),
    setPrinterTargets: (targets) => ipcRenderer.invoke("pos:set-printer-targets", targets),
    testPrint: (payload) => ipcRenderer.invoke("pos:test-print", payload),
  },
  // Phase 12 local-hardware bridge (explicit allowlist — no other native
  // channels are exposed). Mock drivers default ON in the main process until
  // real hardware is configured (POS_HARDWARE_REAL=1).
  hardware: {
    listDevices: () => ipcRenderer.invoke("pos-hardware:list-devices"),
    printJob: (job) => ipcRenderer.invoke("pos-hardware:print-job", job),
    testPrint: (payload) => ipcRenderer.invoke("pos-hardware:test-print", payload),
    openDrawer: (payload) => ipcRenderer.invoke("pos-hardware:open-drawer", payload),
    queueStatus: () => ipcRenderer.invoke("pos-hardware:queue-status"),
    replayQueue: () => ipcRenderer.invoke("pos-hardware:replay-queue"),
    confirmCloudAck: (payload) => ipcRenderer.invoke("pos-hardware:confirm-cloud-ack", payload),
    scannerClaim: (payload) => ipcRenderer.invoke("pos-hardware:scanner-claim", payload),
    scannerRelease: (payload) => ipcRenderer.invoke("pos-hardware:scanner-release", payload),
  },
});
