"use client";

import { useEffect, useRef } from "react";
import { useLanguage, languageHintFromCountryCode, isLanguageUserPicked } from "@dilivygo/i18n";
import { useLocationStore } from "@/stores/location-store";

/**
 * When the customer shares their location, suggest fr/ar from reverse-geocoded country
 * (unless the platform locked language or the user already chose a language explicitly).
 */
export function LocationLanguageHint() {
  const countryCode = useLocationStore((s) => s.countryCode);
  const { locked, setLanguage } = useLanguage();
  const appliedRef = useRef(false);

  useEffect(() => {
    if (locked || appliedRef.current) return;
    if (isLanguageUserPicked()) return;
    const hint = languageHintFromCountryCode(countryCode);
    if (!hint) return;
    appliedRef.current = true;
    setLanguage(hint);
  }, [countryCode, locked, setLanguage]);

  return null;
}
