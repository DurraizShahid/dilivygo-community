"use client";

import { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { cn } from "@dilivygo/ui";
import { useTranslation } from "../use-translation";
import { useLanguage } from "../provider";
import { LANGUAGE_LIST } from "../languages";
import { markLanguageUserPicked } from "../storage";
import type { SupportedLanguage } from "../types";

function LanguageFlag({
  countryCode,
  label,
  className,
  sizePx = 22,
}: {
  countryCode: string;
  label: string;
  className?: string;
  sizePx?: number;
}) {
  const s = `${sizePx}px`;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-md border border-border/50 bg-muted/20 shadow-sm",
        className
      )}
      style={{ width: s, height: s }}
    >
      <ReactCountryFlag
        countryCode={countryCode}
        svg
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        title={label}
        aria-label={label}
      />
    </span>
  );
}

/**
 * Flag + dropdown language control matching customer web header behavior.
 * Persists via `dilivygo-lang` (see `writeStoredLanguage`) and calls `markLanguageUserPicked`.
 */
export function GlobeLanguageMenu({
  className,
  align = "right",
  buttonClassName,
}: {
  className?: string;
  /** Dropdown alignment relative to the trigger */
  align?: "left" | "right";
  buttonClassName?: string;
}) {
  const { t } = useTranslation("common");
  const { language, locked, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (locked) return null;

  const current = LANGUAGE_LIST.find((l) => l.code === language);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          buttonClassName
        )}
        aria-label={t("language.select")}
        aria-expanded={mounted ? open : false}
        suppressHydrationWarning
      >
        {mounted && current ? (
          <LanguageFlag
            countryCode={current.flag}
            label={current.nativeName}
            sizePx={22}
            className="rounded-full border-border/40"
          />
        ) : (
          <Globe className="size-5" />
        )}
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full z-50 mt-2 min-w-[160px] overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl shadow-black/10 backdrop-blur-md dark:bg-card/90 dark:shadow-black/30",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {LANGUAGE_LIST.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                markLanguageUserPicked();
                setLanguage(l.code as SupportedLanguage);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors hover:bg-muted",
                language === l.code && "bg-primary/10 font-medium text-primary"
              )}
            >
              <LanguageFlag countryCode={l.flag} label={l.nativeName} sizePx={22} />
              <span>{l.nativeName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
