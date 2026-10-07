"use client";

import { createContext, useContext } from "react";

export const CurrencyContext = createContext<string>("GBP");

export function useCurrency(): string {
  return useContext(CurrencyContext);
}
