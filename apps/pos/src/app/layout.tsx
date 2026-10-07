import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import {
  DynamicThemeProvider,
  POS_LOGISTICS_THEME_SCOPES,
} from "@dilivygo/ui";
import { DEFAULT_PLATFORM_FAVICON_URL } from "@dilivygo/ui/default-branding-assets";
import { QueryProvider } from "@/providers/query-provider";
import { I18nWrapper } from "@/i18n/i18n-provider-wrapper";
import { WSProvider } from "@/providers/ws-provider";
import { TenantUnavailable } from "@/components/tenant-unavailable";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://insightful-grace-production-9fd7.up.railway.app"
    : "http://localhost:8080");

/** Theme-only fallback when host resolution fails; must not assume a specific tenant. */
const PROJECT_REF_FALLBACK = process.env.NEXT_PUBLIC_PROJECT_REF?.trim() || "_marketplace";

export const metadata: Metadata = {
  title: "Dilivygo POS",
  description: "Point of sale for shop operations",
  ...(DEFAULT_PLATFORM_FAVICON_URL
    ? {
        icons: {
          icon: DEFAULT_PLATFORM_FAVICON_URL,
          shortcut: DEFAULT_PLATFORM_FAVICON_URL,
        },
      }
    : {}),
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const h = await headers();
  const tenantStatus = h.get("x-dilivygo-tenant-status")?.trim();

  // Verified-unknown tenant (fail-closed): render the unavailable surface and
  // never mount the tenant-scoped providers or theme fetch. Prevents an
  // unclaimed custom domain from leaking the marketplace/default tenant.
  if (tenantStatus === "unknown") {
    return (
      <html lang="en" className={inter.variable} suppressHydrationWarning>
        <body suppressHydrationWarning>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
            <TenantUnavailable />
          </ThemeProvider>
          <SpeedInsights />
        </body>
      </html>
    );
  }

  const projectRef = h.get("x-dilivygo-project-ref")?.trim() || PROJECT_REF_FALLBACK;

  return (
    <html
      lang="en"
      className={inter.variable}
      data-pos-shell="logistics"
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <QueryProvider>
            <WSProvider>
              <DynamicThemeProvider
                apiUrl={API_URL}
                appName="pos_web"
                projectRef={projectRef}
                fallbackAppName="Dilivygo POS"
                titleSuffix="POS"
                applyThemeColors
                themeColorScopes={POS_LOGISTICS_THEME_SCOPES}
                themeStorageKey="dilivygo-pos-branding"
              >
                <I18nWrapper>{children}</I18nWrapper>
              </DynamicThemeProvider>
            </WSProvider>
          </QueryProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
