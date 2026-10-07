import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/providers/toaster";
import { QueryProvider } from "@/providers/query-provider";
import {
  DynamicThemeProvider,
  VENDOR_LOGISTICS_THEME_SCOPES,
} from "@dilivygo/ui";
import { I18nWrapper } from "@/i18n/i18n-provider-wrapper";
import { buildVendorMetadata } from "@/lib/platform-theme-metadata";
import { TenantUnavailable } from "@/components/tenant-unavailable";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://insightful-grace-production-9fd7.up.railway.app"
    : "http://localhost:8080");

const PROJECT_REF_FALLBACK = process.env.NEXT_PUBLIC_PROJECT_REF || "_marketplace";

export async function generateMetadata(): Promise<Metadata> {
  return buildVendorMetadata();
}

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
        <body className="antialiased" suppressHydrationWarning>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <TenantUnavailable />
          </ThemeProvider>
          <SpeedInsights />
        </body>
      </html>
    );
  }

  const projectRef = h.get("x-dilivygo-project-ref")?.trim() || PROJECT_REF_FALLBACK;

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <DynamicThemeProvider
              apiUrl={API_URL}
              appName="vendor_web"
              projectRef={projectRef}
              fallbackAppName="Dilivygo"
              titleSuffix="Vendor"
              applyThemeColors
              themeColorScopes={VENDOR_LOGISTICS_THEME_SCOPES}
              themeStorageKey="dilivygo-vendor-branding"
            >
              <I18nWrapper>
                {children}
                <Toaster />
              </I18nWrapper>
            </DynamicThemeProvider>
          </QueryProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
