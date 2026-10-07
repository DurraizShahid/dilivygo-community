import type { Metadata } from "next";
import { headers } from "next/headers";
import { DEFAULT_PLATFORM_FAVICON_URL } from "@dilivygo/ui/default-branding-assets";
import type { ResolvedTheme } from "@dilivygo/types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://insightful-grace-production-9fd7.up.railway.app"
    : "http://localhost:8080");

const PROJECT_REF_DEFAULT = process.env.NEXT_PUBLIC_PROJECT_REF || "_marketplace";

export async function fetchResolvedTheme(projectRef?: string): Promise<ResolvedTheme | null> {
  const h = projectRef ? null : await headers();
  // Fail-closed unknown host: the root layout shows TenantUnavailable and
  // never mounts the theme provider, so never fetch a default tenant's theme.
  if (h?.get("x-dilivygo-tenant-status")?.trim() === "unknown") return null;
  const ref =
    projectRef?.trim() ||
    h?.get("x-dilivygo-project-ref")?.trim() ||
    PROJECT_REF_DEFAULT;
  const qs = new URLSearchParams({
    app: "vendor_web",
    ref,
  });
  try {
    const res = await fetch(`${API_URL}/api/public/theme?${qs}`, {
      next: { revalidate: 120 },
    });
    if (res.status === 204 || !res.ok) return null;
    return (await res.json()) as ResolvedTheme;
  } catch {
    return null;
  }
}

const DEFAULT_TITLE = "Dilivygo Vendor";
const DEFAULT_DESCRIPTION = "Manage your restaurant orders and settings";

export async function buildVendorMetadata(): Promise<Metadata> {
  const theme = await fetchResolvedTheme();
  const title = theme?.appName?.trim() ? `${theme.appName.trim()} Vendor` : DEFAULT_TITLE;
  const ogImage = theme?.ogImageUrl?.trim();
  const iconHref =
    theme?.faviconUrl?.trim() ||
    theme?.logoUrl?.trim() ||
    DEFAULT_PLATFORM_FAVICON_URL ||
    undefined;

  return {
    title,
    description: DEFAULT_DESCRIPTION,
    ...(iconHref
      ? {
          icons: {
            icon: iconHref,
            shortcut: iconHref,
          },
        }
      : {}),
    openGraph: {
      title,
      description: DEFAULT_DESCRIPTION,
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}
