"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

const vendorToastClassNames = {
  toast:
    "vendor-sonner-toast !rounded-xl !border !border-border !bg-card !p-4 !text-card-foreground !shadow-[0_12px_40px_rgba(0,0,0,0.45)] !backdrop-blur-md",
  title: "!text-[15px] !font-semibold !leading-snug !text-foreground",
  description: "!mt-1.5 !text-[13px] !leading-relaxed !text-muted-foreground",
  actionButton:
    "!ml-0 !rounded-lg !border-0 !bg-primary !px-3 !py-2 !text-sm !font-semibold !text-primary-foreground !transition-colors hover:!bg-primary/90",
  cancelButton:
    "!rounded-lg !border !border-border !bg-transparent !px-3 !py-2 !text-sm !font-medium !text-foreground/85 hover:!bg-muted",
  closeButton:
    "!left-auto !right-0 !top-0 !border !border-border !bg-muted !text-muted-foreground hover:!bg-secondary hover:!text-foreground",
  success:
    "!border-[color-mix(in_oklab,var(--chart-2)_35%,var(--border))] !bg-[color-mix(in_oklab,var(--chart-2)_10%,var(--card))]",
  error: "!border-destructive/35 !bg-destructive/10",
  info:
    "!border-[color-mix(in_oklab,var(--chart-1)_26%,var(--border))] !bg-[color-mix(in_oklab,var(--chart-1)_8%,var(--card))]",
  warning:
    "!border-[color-mix(in_oklab,var(--chart-3)_32%,var(--border))] !bg-[color-mix(in_oklab,var(--chart-3)_10%,var(--card))]",
} as const;

export function Toaster() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);
  if (!mounted) return null;
  const sonnerTheme =
    resolvedTheme === "light" || resolvedTheme === "dark" ? resolvedTheme : "system";
  return (
    <SonnerToaster
      position="top-right"
      theme={sonnerTheme}
      richColors={false}
      expand
      closeButton
      visibleToasts={5}
      gap={12}
      offset={16}
      toastOptions={{
        duration: 5500,
        classNames: vendorToastClassNames,
      }}
    />
  );
}
