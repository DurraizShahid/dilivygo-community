import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(cents: number, currency = "GBP"): string {
  const code = (currency && String(currency).trim()) || "GBP";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code.toUpperCase()}`;
  }
}
