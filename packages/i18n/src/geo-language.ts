import type { SupportedLanguage } from "./types";

/** MENA + common Arabic-speaking states */
const AR_COUNTRIES = new Set([
  "DZ",
  "MA",
  "TN",
  "EG",
  "SA",
  "AE",
  "QA",
  "KW",
  "BH",
  "OM",
  "YE",
  "IQ",
  "SY",
  "LB",
  "JO",
  "PS",
  "LY",
  "SD",
  "SO",
  "DJ",
  "MR",
  "KM",
]);

/** Francophone regions (partial list for delivery UX hints) */
const FR_COUNTRIES = new Set([
  "FR",
  "BE",
  "CH",
  "LU",
  "MC",
  "SN",
  "CI",
  "CM",
  "ML",
  "NE",
  "BF",
  "MG",
  "CD",
  "GA",
  "CG",
  "HT",
  "PF",
  "NC",
  "RE",
  "WF",
  "PM",
  "BL",
  "MF",
  "GF",
  "MQ",
  "GP",
]);

/** Spanish-speaking countries */
const ES_COUNTRIES = new Set([
  "ES",
  "MX",
  "AR",
  "CO",
  "CL",
  "PE",
  "VE",
  "EC",
  "GT",
  "CU",
  "BO",
  "DO",
  "HN",
  "SV",
  "NI",
  "CR",
  "PA",
  "UY",
  "PY",
  "GQ",
]);

/** German-speaking countries */
const DE_COUNTRIES = new Set([
  "DE",
  "AT",
  "LI",
]);

/** Turkish-speaking countries */
const TR_COUNTRIES = new Set([
  "TR",
  "CY",
]);

/** Portuguese-speaking countries */
const PT_COUNTRIES = new Set([
  "PT",
  "BR",
  "AO",
  "MZ",
  "GW",
  "TL",
  "CV",
  "ST",
]);

/** Urdu-speaking countries */
const UR_COUNTRIES = new Set([
  "PK",
]);

/** Hindi-speaking countries */
const HI_COUNTRIES = new Set([
  "IN",
]);

/** Persian/Farsi-speaking countries */
const FA_COUNTRIES = new Set([
  "IR",
  "AF",
  "TJ",
]);

/** Chinese-speaking countries/regions */
const ZH_COUNTRIES = new Set([
  "CN",
  "TW",
  "HK",
  "MO",
  "SG",
]);

/** Korean-speaking countries */
const KO_COUNTRIES = new Set([
  "KR",
  "KP",
]);

/** Japanese-speaking countries */
const JA_COUNTRIES = new Set([
  "JP",
]);

/** Russian-speaking countries */
const RU_COUNTRIES = new Set([
  "RU",
  "BY",
  "KZ",
  "KG",
]);

/** Italian-speaking countries */
const IT_COUNTRIES = new Set([
  "IT",
  "SM",
  "VA",
]);

/** Estonian-speaking countries */
const ET_COUNTRIES = new Set([
  "EE",
]);

/** Swahili-speaking countries */
const SW_COUNTRIES = new Set([
  "KE",
  "TZ",
  "UG",
  "RW",
  "CD",
]);

/**
 * Map an ISO 3166-1 alpha-2 country code from geocoding to a suggested UI language.
 */
export function languageHintFromCountryCode(
  code: string | null | undefined,
): SupportedLanguage | null {
  if (!code || typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  if (!c) return null;
  if (AR_COUNTRIES.has(c)) return "ar";
  if (FR_COUNTRIES.has(c)) return "fr";
  if (ES_COUNTRIES.has(c)) return "es";
  if (DE_COUNTRIES.has(c)) return "de";
  if (TR_COUNTRIES.has(c)) return "tr";
  if (PT_COUNTRIES.has(c)) return "pt";
  if (UR_COUNTRIES.has(c)) return "ur";
  if (HI_COUNTRIES.has(c)) return "hi";
  if (FA_COUNTRIES.has(c)) return "fa";
  if (ZH_COUNTRIES.has(c)) return "zh";
  if (KO_COUNTRIES.has(c)) return "ko";
  if (JA_COUNTRIES.has(c)) return "ja";
  if (RU_COUNTRIES.has(c)) return "ru";
  if (IT_COUNTRIES.has(c)) return "it";
  if (ET_COUNTRIES.has(c)) return "et";
  if (SW_COUNTRIES.has(c)) return "sw";
  return null;
}
