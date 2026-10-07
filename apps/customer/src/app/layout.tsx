import type { Metadata } from "next";
import { headers } from "next/headers";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { QueryProvider } from "@/providers/query-provider";
import { DynamicThemeProvider } from "@dilivygo/ui";
import { I18nWrapper } from "@/i18n/i18n-provider-wrapper";
import { buildCustomerMetadata } from "@/lib/platform-theme-metadata";
import { ResolvedProjectRefProvider } from "@/lib/resolved-project-ref";
import { TenantUnavailable } from "@/components/tenant-unavailable";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const API_URL =
  process.env.NODE_ENV === "production"
    ? process.env.NEXT_PUBLIC_API_URL || "https://insightful-grace-production-9fd7.up.railway.app"
    : "";

const PROJECT_REF_FALLBACK = process.env.NEXT_PUBLIC_PROJECT_REF || "_marketplace";

export async function generateMetadata(): Promise<Metadata> {
  return buildCustomerMetadata();
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
      <html lang="en" className={sans.variable} suppressHydrationWarning>
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
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <ResolvedProjectRefProvider value={projectRef}>
              <DynamicThemeProvider
                apiUrl={API_URL}
                appName="customer_web"
                projectRef={projectRef}
                fallbackAppName="Dilivygo"
                applyThemeColors
                themeStorageKey="dilivygo-customer-branding"
              >
                <I18nWrapper>{children}</I18nWrapper>
              </DynamicThemeProvider>
            </ResolvedProjectRefProvider>
          </QueryProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
