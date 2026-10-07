"use client";

import { useEffect, useState, useRef } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "../lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle({
  className,
  /** Overrides default `right-0 top-full mt-1.5` positioning for the dropdown panel (e.g. left rails). */
  menuClassName,
}: {
  className?: string;
  menuClassName?: string;
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function handleDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    // Capture phase + defer one frame so the same user gesture that opened the menu
    // does not immediately see a document listener from a previous open cycle.
    const id = requestAnimationFrame(() => {
      document.addEventListener("click", handleDocClick, true);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("click", handleDocClick, true);
    };
  }, [open]);

  if (!mounted) {
    return (
      <div
        className={cn(
          "size-9 rounded-lg border border-border/60 bg-background",
          className
        )}
      />
    );
  }

  const Icon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Toggle theme"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon className="size-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme"
          className={cn(
            "absolute z-[60] min-w-[148px] rounded-xl border border-border/60 bg-card p-1 shadow-lg",
            menuClassName ?? "right-0 top-full mt-1.5"
          )}
        >
          {options.map(({ value, label, icon: OptionIcon }) => (
            <button
              type="button"
              key={value}
              role="menuitemradio"
              aria-checked={theme === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
                theme === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <OptionIcon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
