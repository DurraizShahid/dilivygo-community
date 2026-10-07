"use client";

import { useEffect, useState } from "react";
import { useLocationStore } from "@/stores/location-store";

/**
 * Header location label that matches SSR + first client paint (avoids hydration
 * mismatch when persisted location store rehydrates with address / GPS state).
 */
export function useHeaderDisplayAddress(
  t: (key: string) => string,
): string {
  const [mounted, setMounted] = useState(false);
  const { address, status, savedAddressId } = useLocationStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return t("header.setLocation");
  }

  return (
    address ||
    (status === "granted" && !savedAddressId
      ? t("header.currentLocation")
      : t("header.setLocation"))
  );
}
