"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { cn } from "../lib/utils";

export interface CurrencyOption {
  code: string;
  name: string;
  /** ISO 3166-1 alpha-2 country code for the flag, or null for supranational currencies */
  country: string | null;
  symbol: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: "usd", name: "US Dollar", country: "US", symbol: "$" },
  { code: "eur", name: "Euro", country: "EU", symbol: "€" },
  { code: "gbp", name: "British Pound", country: "GB", symbol: "£" },
  { code: "jpy", name: "Japanese Yen", country: "JP", symbol: "¥" },
  { code: "aud", name: "Australian Dollar", country: "AU", symbol: "A$" },
  { code: "cad", name: "Canadian Dollar", country: "CA", symbol: "C$" },
  { code: "chf", name: "Swiss Franc", country: "CH", symbol: "CHF" },
  { code: "cny", name: "Chinese Yuan", country: "CN", symbol: "¥" },
  { code: "hkd", name: "Hong Kong Dollar", country: "HK", symbol: "HK$" },
  { code: "nzd", name: "New Zealand Dollar", country: "NZ", symbol: "NZ$" },
  { code: "sek", name: "Swedish Krona", country: "SE", symbol: "kr" },
  { code: "krw", name: "South Korean Won", country: "KR", symbol: "₩" },
  { code: "sgd", name: "Singapore Dollar", country: "SG", symbol: "S$" },
  { code: "nok", name: "Norwegian Krone", country: "NO", symbol: "kr" },
  { code: "mxn", name: "Mexican Peso", country: "MX", symbol: "$" },
  { code: "inr", name: "Indian Rupee", country: "IN", symbol: "₹" },
  { code: "brl", name: "Brazilian Real", country: "BR", symbol: "R$" },
  { code: "zar", name: "South African Rand", country: "ZA", symbol: "R" },
  { code: "dkk", name: "Danish Krone", country: "DK", symbol: "kr" },
  { code: "pln", name: "Polish Zloty", country: "PL", symbol: "zł" },
  { code: "thb", name: "Thai Baht", country: "TH", symbol: "฿" },
  { code: "idr", name: "Indonesian Rupiah", country: "ID", symbol: "Rp" },
  { code: "huf", name: "Hungarian Forint", country: "HU", symbol: "Ft" },
  { code: "czk", name: "Czech Koruna", country: "CZ", symbol: "Kč" },
  { code: "ils", name: "Israeli Shekel", country: "IL", symbol: "₪" },
  { code: "php", name: "Philippine Peso", country: "PH", symbol: "₱" },
  { code: "myr", name: "Malaysian Ringgit", country: "MY", symbol: "RM" },
  { code: "ron", name: "Romanian Leu", country: "RO", symbol: "lei" },
  { code: "bgn", name: "Bulgarian Lev", country: "BG", symbol: "лв" },
  { code: "hrk", name: "Croatian Kuna", country: "HR", symbol: "kn" },
  { code: "try", name: "Turkish Lira", country: "TR", symbol: "₺" },
  { code: "aed", name: "UAE Dirham", country: "AE", symbol: "د.إ" },
  { code: "sar", name: "Saudi Riyal", country: "SA", symbol: "﷼" },
  { code: "qar", name: "Qatari Riyal", country: "QA", symbol: "﷼" },
  { code: "kwd", name: "Kuwaiti Dinar", country: "KW", symbol: "د.ك" },
  { code: "bhd", name: "Bahraini Dinar", country: "BH", symbol: "BD" },
  { code: "omr", name: "Omani Rial", country: "OM", symbol: "﷼" },
  { code: "jod", name: "Jordanian Dinar", country: "JO", symbol: "JD" },
  { code: "egp", name: "Egyptian Pound", country: "EG", symbol: "E£" },
  { code: "ngn", name: "Nigerian Naira", country: "NG", symbol: "₦" },
  { code: "kes", name: "Kenyan Shilling", country: "KE", symbol: "KSh" },
  { code: "ghs", name: "Ghanaian Cedi", country: "GH", symbol: "₵" },
  { code: "tzs", name: "Tanzanian Shilling", country: "TZ", symbol: "TSh" },
  { code: "ugx", name: "Ugandan Shilling", country: "UG", symbol: "USh" },
  { code: "rwf", name: "Rwandan Franc", country: "RW", symbol: "RF" },
  { code: "mad", name: "Moroccan Dirham", country: "MA", symbol: "MAD" },
  { code: "tnd", name: "Tunisian Dinar", country: "TN", symbol: "DT" },
  { code: "pkr", name: "Pakistani Rupee", country: "PK", symbol: "₨" },
  { code: "bdt", name: "Bangladeshi Taka", country: "BD", symbol: "৳" },
  { code: "lkr", name: "Sri Lankan Rupee", country: "LK", symbol: "Rs" },
  { code: "vnd", name: "Vietnamese Dong", country: "VN", symbol: "₫" },
  { code: "twd", name: "Taiwan Dollar", country: "TW", symbol: "NT$" },
  { code: "cop", name: "Colombian Peso", country: "CO", symbol: "$" },
  { code: "clp", name: "Chilean Peso", country: "CL", symbol: "$" },
  { code: "pen", name: "Peruvian Sol", country: "PE", symbol: "S/" },
  { code: "ars", name: "Argentine Peso", country: "AR", symbol: "$" },
  { code: "uyu", name: "Uruguayan Peso", country: "UY", symbol: "$U" },
  { code: "bob", name: "Bolivian Boliviano", country: "BO", symbol: "Bs" },
  { code: "pyg", name: "Paraguayan Guarani", country: "PY", symbol: "₲" },
  { code: "crc", name: "Costa Rican Colon", country: "CR", symbol: "₡" },
  { code: "gtq", name: "Guatemalan Quetzal", country: "GT", symbol: "Q" },
  { code: "hnl", name: "Honduran Lempira", country: "HN", symbol: "L" },
  { code: "nio", name: "Nicaraguan Cordoba", country: "NI", symbol: "C$" },
  { code: "jmd", name: "Jamaican Dollar", country: "JM", symbol: "J$" },
  { code: "ttd", name: "Trinidad Dollar", country: "TT", symbol: "TT$" },
  { code: "bbd", name: "Barbadian Dollar", country: "BB", symbol: "Bds$" },
  { code: "xcd", name: "East Caribbean Dollar", country: null, symbol: "EC$" },
  { code: "bsd", name: "Bahamian Dollar", country: "BS", symbol: "B$" },
  { code: "kyd", name: "Cayman Islands Dollar", country: "KY", symbol: "CI$" },
  { code: "bmd", name: "Bermudian Dollar", country: "BM", symbol: "BD$" },
  { code: "fjd", name: "Fijian Dollar", country: "FJ", symbol: "FJ$" },
  { code: "xof", name: "West African CFA Franc", country: null, symbol: "CFA" },
  { code: "xaf", name: "Central African CFA Franc", country: null, symbol: "FCFA" },
];

const currencyMap = new Map(CURRENCIES.map((c) => [c.code, c]));

function resolveCurrency(value: string): CurrencyOption | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const known = currencyMap.get(normalized);
  if (known) return known;
  if (/^[a-z]{3}$/.test(normalized)) {
    return {
      code: normalized,
      name: "Custom ISO code",
      country: null,
      symbol: normalized.toUpperCase(),
    };
  }
  return null;
}

export function CurrencyFlag({ country, size = "1.2em" }: { country: string | null; size?: string }) {
  if (!country) return <span style={{ width: size, display: "inline-block", textAlign: "center" }}>🌍</span>;
  return (
    <ReactCountryFlag
      countryCode={country}
      svg
      style={{ width: size, height: "auto", borderRadius: 2 }}
      aria-label={country}
    />
  );
}

export function CurrencyPicker({
  value,
  onChange,
  disabled,
  className,
  allowEmpty = false,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  /** e.g. max-w-none to stretch full width */
  className?: string;
  /** When true, show “clear” so the value can be set to "" (e.g. workspace inherits platform currency). */
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = resolveCurrency(value);
  const query = search.toLowerCase().trim();

  const filtered = query
    ? CURRENCIES.filter(
        (c) =>
          c.code.includes(query) ||
          c.name.toLowerCase().includes(query) ||
          c.symbol.toLowerCase().includes(query),
      )
    : CURRENCIES;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-sm", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50",
          open && "ring-2 ring-primary/30",
        )}
      >
        {selected ? (
          <>
            <CurrencyFlag country={selected.country} size="1.4em" />
            <span className="flex-1 font-medium">
              {selected.name}{" "}
              <span className="text-muted-foreground">
                ({selected.code.toUpperCase()}) {selected.symbol}
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">Select currency…</span>
        )}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search currencies…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {allowEmpty ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 border-b border-border/40 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60"
              >
                <span className="flex-1">No default (inherit platform currency)</span>
              </button>
            ) : null}
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No currency found.</p>
            ) : (
              filtered.map((c) => {
                const isSelected = c.code === value.trim().toLowerCase();
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      onChange(c.code);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                      isSelected && "bg-primary/5",
                    )}
                  >
                    <CurrencyFlag country={c.country} />
                    <span className="flex-1">
                      <span className="font-medium">{c.name}</span>{" "}
                      <span className="text-muted-foreground">{c.code.toUpperCase()}</span>
                    </span>
                    <span className="w-10 text-right text-xs text-muted-foreground">{c.symbol}</span>
                    {isSelected && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
