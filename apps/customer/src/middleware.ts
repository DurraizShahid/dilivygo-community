import { createDilivygoSaasMiddleware } from "@dilivygo/tenant-host";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "https://insightful-grace-production-9fd7.up.railway.app" : "http://127.0.0.1:8080");

const ENV_REF = process.env.NEXT_PUBLIC_PROJECT_REF?.trim() || "_marketplace";

export default createDilivygoSaasMiddleware({
  apiUrl: API_URL,
  appSurface: "customer",
  envProjectRef: ENV_REF,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
