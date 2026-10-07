"use client";

import type { HTMLAttributes } from "react";
import { useContext, useEffect, useState } from "react";
import { cn, formatPrice } from "../lib/utils";
import { CurrencyContext } from "../providers/currency-context";
import { useExchangeRates, convertCents } from "../hooks/use-exchange-rates";

interface PriceWithConversionProps extends HTMLAttributes<HTMLSpanElement> {
  cents: number;
  /** The currency this price is in (e.g. the shop's currency) */
  currency: string;
  /** API base URL for fetching exchange rates (uses relative URL if omitted) */
  apiUrl?: string;
}

function detectLocalCurrency(): string | null {
  if (typeof navigator === "undefined") return null;
  try {
    const locale = navigator.language || "en";
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).resolvedOptions();
    const regionMatch = locale.match(/[-_]([A-Z]{2})$/i);
    if (!regionMatch) return null;
    const region = regionMatch[1].toUpperCase();
    const regionCurrencyMap: Record<string, string> = {
      US: "usd", GB: "gbp", EU: "eur", DE: "eur", FR: "eur", ES: "eur",
      IT: "eur", NL: "eur", BE: "eur", AT: "eur", PT: "eur", FI: "eur",
      IE: "eur", GR: "eur", JP: "jpy", CN: "cny", IN: "inr", AU: "aud",
      CA: "cad", CH: "chf", SE: "sek", NO: "nok", DK: "dkk", NZ: "nzd",
      SG: "sgd", HK: "hkd", KR: "krw", BR: "brl", MX: "mxn", ZA: "zar",
      PL: "pln", CZ: "czk", HU: "huf", RO: "ron", BG: "bgn", TR: "try",
      AE: "aed", SA: "sar", EG: "egp", NG: "ngn", KE: "kes", PK: "pkr",
      BD: "bdt", PH: "php", MY: "myr", TH: "thb", ID: "idr", VN: "vnd",
      TW: "twd", CO: "cop", CL: "clp", PE: "pen", AR: "ars",
    };
    return regionCurrencyMap[region] || null;
  } catch {
    return null;
  }
}

/**
 * Displays a price in the shop's currency with an optional approximate
 * conversion to the customer's local currency shown as a secondary line.
 */
export function PriceWithConversion({
  cents,
  currency,
  apiUrl,
  className,
  ...props
}: PriceWithConversionProps) {
  const platformCurrency = useContext(CurrencyContext);
  const shopCurrency = currency || platformCurrency || "GBP";

  /** Null on server + first client paint — detecting via `navigator` must not run during SSR (hydration mismatch). */
  const [localCurrency, setLocalCurrency] = useState<string | null>(null);
  useEffect(() => {
    setLocalCurrency(detectLocalCurrency());
  }, []);

  const needsConversion =
    localCurrency && localCurrency.toLowerCase() !== shopCurrency.toLowerCase();

  const { rates } = useExchangeRates(
    needsConversion ? shopCurrency : "",
    apiUrl,
  );

  const convertedCents = needsConversion
    ? convertCents(cents, rates, localCurrency)
    : null;

  return (
    <span className={cn("inline-flex flex-col", className)} {...props}>
      <span className="font-semibold tabular-nums">
        {formatPrice(cents, shopCurrency.toUpperCase())}
      </span>
      {convertedCents != null && (
        <span className="text-[0.7em] text-muted-foreground tabular-nums">
          ≈ {formatPrice(convertedCents, localCurrency!.toUpperCase())}
        </span>
      )}
    </span>
  );
}
