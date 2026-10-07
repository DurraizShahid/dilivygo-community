import { createApiClient, createWSClient } from "@dilivygo/api";
import { resolveApiBaseUrl } from "./resolve-api-base-url";

export const API_BASE_URL = resolveApiBaseUrl();
const WS_URL = API_BASE_URL.replace(/^http/, "ws") + "/ws";

let authToken: string | null = null;

export function setApiAuthToken(token: string | null) {
  authToken = token;
}

export function getMobileAuthToken() {
  return authToken;
}

export const api = createApiClient(API_BASE_URL, {
  getAuthToken: () => authToken,
  defaultHeaders: { "x-dilivygo-actor": "customer" },
});
export const wsClient = createWSClient(WS_URL, {
  getAuthToken: () => authToken,
});
