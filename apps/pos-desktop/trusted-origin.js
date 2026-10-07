"use strict";

/**
 * Pure trusted-origin resolution for the POS desktop shell.
 *
 * Kept free of Electron imports so the rules can be unit-tested with plain
 * `node --test`. `main.js` injects `app.isPackaged` + `process.env`.
 *
 * The packaged POS binary is pinned to a single operator-configured tenant URL
 * (`POS_DESKTOP_TARGET_URL`). Nothing a renderer can do — navigation, redirects,
 * deep links, window chips — may move the shell off that origin.
 */

const DEFAULT_DEV_URL = "http://localhost:3004";

/**
 * Resolve the URL the shell is allowed to load.
 *
 * Packaged builds require `POS_DESKTOP_TARGET_URL` pointing at a non-local
 * HTTPS origin. Dev builds default to the local POS web app and accept HTTP(S)
 * only (Electron's `http:` / `https:` buckets).
 *
 * @param {{ isPackaged?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {URL}
 */
function resolveTrustedTarget({ isPackaged = false, env = process.env } = {}) {
  const raw = String(
    isPackaged
      ? String(env.POS_DESKTOP_TARGET_URL || "").trim()
      : String((env.POS_DESKTOP_DEV_URL || "").trim() || DEFAULT_DEV_URL).trim()
  ).trim();

  if (!raw) {
    throw new Error("POS_DESKTOP_TARGET_URL is required for packaged POS builds");
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("POS desktop target URL is invalid");
  }

  if (isPackaged) {
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1"
    ) {
      throw new Error("Packaged POS must target a non-local HTTPS origin");
    }
  } else if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("POS development target must use HTTP(S)");
  }

  return parsed;
}

/**
 * A navigation/redirect/deep-link target is trusted only when it shares the
 * exact origin of the trusted POS target. Everything else (cross-origin,
 * `data:`, `file:`, garbage) is rejected.
 *
 * @param {string} rawUrl
 * @param {string} trustedOrigin
 * @returns {boolean}
 */
function isTrustedUrl(rawUrl, trustedOrigin) {
  try {
    return new URL(String(rawUrl || "")).origin === String(trustedOrigin || "");
  } catch {
    return false;
  }
}

module.exports = {
  resolveTrustedTarget,
  isTrustedUrl,
  DEFAULT_DEV_URL,
};