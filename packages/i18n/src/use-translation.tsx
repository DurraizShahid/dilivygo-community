"use client";

import { useMemo } from "react";
import {
  useTranslation as useTranslationI18n,
  type UseTranslationOptions,
} from "react-i18next";
import { useLanguage } from "./provider";

/**
 * Like react-i18next's `useTranslation`, but `t()` always resolves using the
 * language from `useLanguage()` (same source as SSR / hydration-safe first paint).
 *
 * Without this, `t()` follows the i18next instance's `lng`, which can disagree
 * with React state for one frame and cause hydration mismatches (e.g. EN vs Urdu).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirror react-i18next overloads
export function useTranslation(ns?: any, options?: UseTranslationOptions<any>) {
  const result = useTranslationI18n(ns, options);
  const { language } = useLanguage();

  const nsForFixed = useMemo(() => {
    if (typeof ns === "string") return ns;
    if (Array.isArray(ns) && ns.length > 0) return ns[0];
    return undefined;
  }, [ns]);

  const t = useMemo(
    () =>
      result.i18n.getFixedT(
        language,
        nsForFixed as string | string[] | undefined,
        options?.keyPrefix as string | undefined,
      ),
    [result.i18n, language, nsForFixed, options?.keyPrefix],
  );

  return { ...result, t };
}
