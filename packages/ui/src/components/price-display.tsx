"use client";

import type { HTMLAttributes } from "react";
import { useContext } from "react";
import { cn, formatPrice } from "../lib/utils";
import { CurrencyContext } from "../providers/currency-context";

interface PriceDisplayProps extends HTMLAttributes<HTMLSpanElement> {
  cents: number;
  currency?: string;
}

export function PriceDisplay({
  cents,
  currency,
  className,
  ...props
}: PriceDisplayProps) {
  const ctxCurrency = useContext(CurrencyContext);
  const resolved = currency || ctxCurrency || "GBP";

  return (
    <span className={cn("font-semibold tabular-nums", className)} {...props}>
      {formatPrice(cents, resolved)}
    </span>
  );
}
