"use client";

import { useMemo, useSyncExternalStore } from "react";

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function reducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function reducedMotionServerSnapshot() {
  return false;
}

/** Chrome-only hint; ignored when unavailable. */
function hasLowDeviceMemory(): boolean {
  if (typeof navigator === "undefined") return false;
  const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof dm === "number" && dm > 0 && dm <= 4;
}

/**
 * Use a lighter dual-axis chart (fewer SVG nodes) when the user prefers reduced
 * motion or the device reports ≤4GB RAM (Chromium `deviceMemory`).
 */
export function useDualChartLiteMode(): boolean {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    reducedMotionServerSnapshot,
  );

  return useMemo(
    () => reducedMotion || hasLowDeviceMemory(),
    [reducedMotion],
  );
}
