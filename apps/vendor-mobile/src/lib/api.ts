import { createApiClient, createWSClient } from "@dilivygo/api";
import { resolveApiBaseUrl } from "./resolve-api-base-url";

export const API_BASE_URL = resolveApiBaseUrl();
const WS_URL = API_BASE_URL.replace(/^http/, "ws") + "/ws";

/** SecureStore key — staff JWT for Bearer auth (cookies are not reliable on React Native). */
export const VENDOR_STAFF_TOKEN_KEY = "vendor_staff_auth_token";

let authToken: string | null = null;

export function setApiAuthToken(token: string | null) {
  authToken = token;
}

export function getMobileAuthToken() {
  return authToken;
}

export const api = createApiClient(API_BASE_URL, {
  getAuthToken: () => authToken,
});

export const wsClient = createWSClient(WS_URL, {
  getAuthToken: () => authToken,
});
