import type { CustomerAddress } from "@dilivygo/types";

export function formatCustomerAddressLine(a: CustomerAddress): string {
  return [a.addressLine1, a.addressLine2, a.city, a.postcode]
    .filter(Boolean)
    .join(", ");
}

export function customerAddressHeaderLine(a: CustomerAddress): string {
  const label = a.label?.trim();
  if (label && a.addressLine1?.trim()) {
    return `${label} · ${a.addressLine1.trim()}`;
  }
  return formatCustomerAddressLine(a);
}
