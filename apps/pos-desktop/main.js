const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const posHardwareDrivers = require("./pos-hardware-drivers");

app.enableSandbox();

const DEV_URL = process.env.POS_DESKTOP_DEV_URL || "http://localhost:3004";
const CASHIER_PRINTER = process.env.POS_PRINTER_CASHIER || "";
const KITCHEN_PRINTER = process.env.POS_PRINTER_KITCHEN || "";
const MAX_RECEIPT_HTML_BYTES = 512 * 1024;
const PRINT_PARTITION = "dilivygo-pos-print";

const DEFAULT_TEST_RECEIPT_HTML = `
<html>
  <head>
    <title>Printer Test</title>
    <style>
      body { font-family: monospace; padding: 14px; width: 300px; }
      h2, p { margin: 0; }
      .spacer { margin: 8px 0; border-top: 1px dashed #000; }
    </style>
  </head>
  <body>
    <h2>Dilivygo POS Printer Test</h2>
    <p>If this prints clearly, your printer target is configured.</p>
    <div class="spacer"></div>
    <p>Status: OK</p>
  </body>
</html>
`;

const printerTargets = {
  cashier: CASHIER_PRINTER,
  kitchen: KITCHEN_PRINTER,
};

let trustedTarget = null;

function resolveTrustedTarget() {
  if (trustedTarget) return trustedTarget;

  const raw = app.isPackaged
    ? String(process.env.POS_DESKTOP_TARGET_URL || "").trim()
    : String(DEV_URL || "").trim();

  if (!raw) {
    throw new Error("POS_DESKTOP_TARGET_URL is required for packaged POS builds");
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("POS desktop target URL is invalid");
  }

  if (app.isPackaged) {
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || host === "localhost" || host === "127.0.0.1" || host === "::1") {
      throw new Error("Packaged POS must target a non-local HTTPS origin");
    }
  } else if (!(["http:", "https:"].includes(parsed.protocol))) {
    throw new Error("POS development target must use HTTP(S)");
  }

  trustedTarget = parsed;
  return trustedTarget;
}

function isTrustedUrl(rawUrl) {
  try {
    return new URL(rawUrl).origin === resolveTrustedTarget().origin;
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || "";
  if (!isTrustedUrl(senderUrl)) {
    throw new Error("Native POS bridge rejected an untrusted renderer origin");
  }
}

function secureHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...args);
  });
}

function resolvePrinterName(variant) {
  if (variant === "kitchen") return printerTargets.kitchen || "";
  return printerTargets.cashier || "";
}

function validateReceiptHtml(value) {
  const html = String(value || "");
  if (!html) throw new Error("Missing receiptHtml");
  if (Buffer.byteLength(html, "utf8") > MAX_RECEIPT_HTML_BYTES) {
    throw new Error("Receipt HTML exceeds the maximum allowed size");
  }
  return html;
}

async function printReceiptNative(payload = {}) {
  let html;
  try {
    html = validateReceiptHtml(payload.receiptHtml);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const printWin = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: PRINT_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  // Receipt HTML is display/print content only. It may not navigate, open a
  // window, request permissions, or use the network as an exfiltration path.
  printWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  printWin.webContents.on("will-navigate", (event) => event.preventDefault());

  const target = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await printWin.loadURL(target);

  const deviceName = resolvePrinterName(payload.variant);
  const printOptions = deviceName
    ? { silent: true, printBackground: true, deviceName }
    : { silent: false, printBackground: true };

  const result = await new Promise((resolve) => {
    printWin.webContents.print(printOptions, (success, failureReason) => {
      if (!success) {
        resolve({ ok: false, error: failureReason || "Print failed" });
      } else {
        resolve({ ok: true, deviceName: deviceName || null });
      }
    });
  });

  if (!printWin.isDestroyed()) printWin.close();
  return result;
}

function createWindow() {
  const target = resolveTrustedTarget();
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });

  win.loadURL(target.toString());
}

app.whenReady().then(() => {
  // The receipt renderer has its own in-memory session. Deny all permissions and
  // network/file subresource requests; only its initial data: document is used.
  const printSession = session.fromPartition(PRINT_PARTITION, { cache: false });
  printSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  printSession.setPermissionCheckHandler(() => false);
  printSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "file://*/*"] },
    (_details, callback) => callback({ cancel: true }),
  );

  // The main POS surface does not need browser-level device permissions. Native
  // printer access is exposed only through the validated IPC bridge below.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  secureHandle("pos:list-printers", async (event) => {
    const printers = await event.sender.getPrintersAsync();
    return {
      printers: printers.map((printer) => ({
        name: printer.name,
        isDefault: Boolean(printer.isDefault),
        status: printer.status || null,
        description: printer.description || null,
      })),
      targets: { ...printerTargets },
    };
  });

  secureHandle("pos:set-printer-targets", async (_event, payload = {}) => {
    if (typeof payload.cashier === "string") printerTargets.cashier = payload.cashier.slice(0, 256);
    if (typeof payload.kitchen === "string") printerTargets.kitchen = payload.kitchen.slice(0, 256);
    return { ...printerTargets };
  });

  secureHandle("pos:test-print", async (_event, payload = {}) => {
    const variant = payload.variant === "kitchen" ? "kitchen" : "cashier";
    const receiptHtml =
      typeof payload.receiptHtml === "string" && payload.receiptHtml.trim().length
        ? payload.receiptHtml
        : DEFAULT_TEST_RECEIPT_HTML;
    return printReceiptNative({ variant, receiptHtml });
  });

  secureHandle("pos:print-receipt", async (_event, payload) => printReceiptNative(payload));

  const isReal = String(process.env.POS_HARDWARE_REAL || "") === "1";
  let printerAdapter;
  if (isReal) {
    printerAdapter = {
      kind: "native-printer",
      async print(job = {}) {
        if (!job.receiptHtml) {
          return { ok: false, error: "Missing receiptHtml for real printer execution" };
        }
        return printReceiptNative({
          variant: job.variant,
          receiptHtml: job.receiptHtml,
        });
      },
    };
  } else {
    printerAdapter = posHardwareDrivers.createMockPrinterDriver();
  }

  // Phase 12 (local hardware only): idempotent print-job queue, cash-drawer
  // kick (permission-flagged, printer-path only), and scanner claim channels.
  const hardwareBridge = posHardwareDrivers.registerPosHardwareIpc({
    secureHandle,
    env: process.env,
    adapters: {
      printer: printerAdapter,
      userDataDir: app.getPath("userData"),
      getPrinters: async (event) => {
        const printers = await event.sender.getPrintersAsync();
        return printers.map((printer) => ({
          name: printer.name,
          isDefault: Boolean(printer.isDefault),
          status: printer.status || null,
          description: printer.description || null,
        }));
      },
      testPrint: (payload = {}) => {
        const variant = payload.variant === "kitchen" ? "kitchen" : "cashier";
        const receiptHtml =
          typeof payload.receiptHtml === "string" && payload.receiptHtml.trim().length
            ? payload.receiptHtml
            : DEFAULT_TEST_RECEIPT_HTML;
        return printReceiptNative({ variant, receiptHtml });
      },
    },
  });

  secureHandle("pos:receipt-event", async (_event, detail = {}) => {
    if (!detail?.shouldPrint) return { ok: true, skipped: true };
    const idempotencyKey = detail.idempotencyKey || `rec:${detail.orderId || "unknown"}:${detail.variant || "cashier"}:${Date.now()}`;
    const job = {
      idempotencyKey,
      cloudJobId: detail.jobId || null,
      shopId: detail.shopId || null,
      projectRef: detail.projectRef || null,
      variant: detail.variant || "cashier",
      receiptHtml: detail.receiptHtml,
    };
    const existing = hardwareBridge.queue.all().find((r) => r.idempotencyKey === idempotencyKey);
    if (existing) {
      if (existing.status === "reconciled" || existing.status === "printed_pending_cloud_ack") {
        return { ok: true, deduped: true, printed: true, idempotencyKey };
      }
      if (detail.receiptHtml && !existing.receiptHtml) {
        existing.receiptHtml = detail.receiptHtml;
      }
      const res = await hardwareBridge.queue.attempt(existing);
      if (res.printed) return { ok: true, printed: true, deduped: true, idempotencyKey };
      return {
        ok: false,
        printed: false,
        queued: true,
        deduped: true,
        idempotencyKey,
        error: res.error || "Print failed — job kept in offline queue",
      };
    }

    const enqueued = hardwareBridge.queue.enqueue(job);
    if (!enqueued.ok) return enqueued;
    const row = hardwareBridge.queue.all().find((r) => r.idempotencyKey === idempotencyKey);
    const result = await hardwareBridge.queue.attempt(row);
    if (result.printed) return { ok: true, printed: true, idempotencyKey };
    return {
      ok: false,
      printed: false,
      queued: true,
      idempotencyKey,
      error: result.error || "Print failed — job kept in offline queue",
    };
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error("Dilivygo POS failed secure startup:", err.message);
  app.exit(1);
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
