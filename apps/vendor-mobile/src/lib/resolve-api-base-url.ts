import { Platform } from "react-native";
import Constants from "expo-constants";

const PRODUCTION_API_URL = "https://insightful-grace-production-9fd7.up.railway.app";

/**
 * Dev API origin for Expo: `localhost` is wrong on Android emulator (use 10.0.2.2)
 * and on physical devices (use the machine that runs Metro, from hostUri).
 */
export function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (!__DEV__) {
    return PRODUCTION_API_URL;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    let host = hostUri.split(":")[0];
    if (host === "localhost" || host === "127.0.0.1") {
      host = Platform.OS === "android" ? "10.0.2.2" : "localhost";
    }
    if (host) {
      return `http://${host}:8080`;
    }
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:8080";
  }

  return "http://localhost:8080";
}
