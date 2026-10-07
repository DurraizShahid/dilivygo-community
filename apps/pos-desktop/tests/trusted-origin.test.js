"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveTrustedTarget,
  isTrustedUrl,
  DEFAULT_DEV_URL,
} = require("../trusted-origin");

test("packaged build requires POS_DESKTOP_TARGET_URL", () => {
  assert.throws(
    () => resolveTrustedTarget({ isPackaged: true, env: {} }),
    /POS_DESKTOP_TARGET_URL is required for packaged POS builds/
  );
});

test("packaged build with an invalid URL is rejected", () => {
  assert.throws(
    () => resolveTrustedTarget({ isPackaged: true, env: { POS_DESKTOP_TARGET_URL: "not a url" } }),
    /POS desktop target URL is invalid/
  );
});

test("packaged build accepts a non-local HTTPS origin", () => {
  const url = resolveTrustedTarget({
    isPackaged: true,
    env: { POS_DESKTOP_TARGET_URL: "https://pos.acme.example/dashboard" },
  });
  assert.equal(url.origin, "https://pos.acme.example");
});

test("packaged build rejects HTTPS pointed at localhost", () => {
  assert.throws(
    () => resolveTrustedTarget({ isPackaged: true, env: { POS_DESKTOP_TARGET_URL: "https://localhost:3004" } }),
    /Packaged POS must target a non-local HTTPS origin/
  );
});

test("packaged build rejects HTTPS pointed at 127.0.0.1 and ::1", () => {
  assert.throws(
    () => resolveTrustedTarget({ isPackaged: true, env: { POS_DESKTOP_TARGET_URL: "https://127.0.0.1:3004" } }),
    /Packaged POS must target a non-local HTTPS origin/
  );
  assert.throws(
    () => resolveTrustedTarget({ isPackaged: true, env: { POS_DESKTOP_TARGET_URL: "http://[::1]:3004" } }),
    /Packaged POS must target a non-local HTTPS origin/
  );
});

test("packaged build rejects plain HTTP", () => {
  assert.throws(
    () => resolveTrustedTarget({ isPackaged: true, env: { POS_DESKTOP_TARGET_URL: "http://pos.acme.example" } }),
    /Packaged POS must target a non-local HTTPS origin/
  );
});

test("dev build defaults to the local POS web app", () => {
  const url = resolveTrustedTarget({ isPackaged: false, env: {} });
  assert.equal(url.href, DEFAULT_DEV_URL + "/");
  assert.equal(url.origin, "http://localhost:3004");
});

test("dev build honors POS_DESKTOP_DEV_URL", () => {
  const url = resolveTrustedTarget({
    isPackaged: false,
    env: { POS_DESKTOP_DEV_URL: "https://pos-dev.acme.example" },
  });
  assert.equal(url.origin, "https://pos-dev.acme.example");
});

test("dev build rejects non-HTTP(S) schemes", () => {
  assert.throws(
    () => resolveTrustedTarget({ isPackaged: false, env: { POS_DESKTOP_DEV_URL: "ftp://pos.acme.example" } }),
    /POS development target must use HTTP\(S\)/
  );
});

test("isTrustedUrl accepts same-origin navigations", () => {
  const trusted = "https://pos.acme.example";
  assert.equal(isTrustedUrl("https://pos.acme.example/orders/123", trusted), true);
  assert.equal(isTrustedUrl("https://pos.acme.example", trusted), true);
});

test("isTrustedUrl rejects cross-origin, non-http, and garbage targets", () => {
  const trusted = "https://pos.acme.example";
  assert.equal(isTrustedUrl("https://evil.example/phish", trusted), false);
  assert.equal(isTrustedUrl("https://pos.acme.example.evil.example", trusted), false);
  assert.equal(isTrustedUrl("http://pos.acme.example", trusted), false);
  assert.equal(isTrustedUrl("data:text/html,<h1>x</h1>", trusted), false);
  assert.equal(isTrustedUrl("file:///etc/passwd", trusted), false);
  assert.equal(isTrustedUrl("", trusted), false);
  assert.equal(isTrustedUrl("not a url", trusted), false);
});

test("isTrustedUrl rejects a missing trusted origin", () => {
  assert.equal(isTrustedUrl("https://pos.acme.example", ""), false);
});