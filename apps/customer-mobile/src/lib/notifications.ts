import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { router } from "expo-router";
import type { PushPlatform } from "@dilivygo/types";
import { api } from "./api";

type ExpoNotifications = typeof import("expo-notifications");

/** Expo Go — remote push was removed from the client in SDK 53+; loading the module throws/warns. */
function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface NotificationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
}

export interface PushTokenResult {
  token: string | null;
  error?: string;
}

type NotificationResponseLike = {
  notification: { request: { content: { data?: Record<string, unknown> } } };
};

// ─── Permission & Token Registration ────────────────────────────────────────────

/**
 * Request notification permissions and get Expo push token.
 * Returns the token if successful, or null with an error message.
 */
export async function registerForPushNotifications(): Promise<PushTokenResult> {
  if (isExpoGo()) {
    return { token: null };
  }

  const isPhysicalDevice = !__DEV__ || Constants.isDevice;
  if (!isPhysicalDevice && __DEV__) {
    console.log("Push notifications work best on physical devices");
  }

  const Notifications = await import("expo-notifications");

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return { token: null, error: "Permission not granted for push notifications" };
    }

    if (Platform.OS === "android") {
      await setupAndroidNotificationChannel(Notifications);
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;

    await registerTokenWithBackend(token);

    return { token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register for push notifications";
    console.error("Push notification registration error:", message);
    return { token: null, error: message };
  }
}

async function registerTokenWithBackend(token: string): Promise<void> {
  const platform: PushPlatform = Platform.OS === "ios" ? "ios" : "android";

  try {
    await api.push.register(token, platform);
    console.log("Push token registered with backend");
  } catch (error) {
    console.error("Failed to register push token with backend:", error);
    throw error;
  }
}

/**
 * Unregister the push token from the backend (call on logout).
 */
export async function unregisterPushToken(): Promise<void> {
  const platform: PushPlatform = Platform.OS === "ios" ? "ios" : "android";

  try {
    await api.push.unregister(platform);
    console.log("Push token unregistered from backend");
  } catch (error) {
    console.error("Failed to unregister push token:", error);
  }
}

// ─── Android Channel Setup ──────────────────────────────────────────────────────

async function setupAndroidNotificationChannel(Notifications: ExpoNotifications): Promise<void> {
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF6B35",
  });

  await Notifications.setNotificationChannelAsync("orders", {
    name: "Order Updates",
    description: "Notifications about your order status",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF6B35",
  });

  await Notifications.setNotificationChannelAsync("chat", {
    name: "Chat Messages",
    description: "New message notifications",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });

  await Notifications.setNotificationChannelAsync("promotions", {
    name: "Promotions & Offers",
    description: "Special offers and discounts",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// ─── Notification Handlers ──────────────────────────────────────────────────────

export function setupNotificationHandlers(): void {
  if (isExpoGo()) return;
  void import("expo-notifications").then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data;
        const type = data?.type as string | undefined;

        const shouldShow =
          type === "chat_message" ||
          type?.startsWith("order_") ||
          type?.startsWith("delivery_") ||
          type?.startsWith("cx_") ||
          false;

        return {
          shouldShowAlert: shouldShow,
          shouldPlaySound: shouldShow,
          shouldSetBadge: true,
          shouldShowBanner: shouldShow,
          shouldShowList: shouldShow,
        };
      },
    });
  });
}

function handleNotificationResponse(response: NotificationResponseLike): void {
  const data = response.notification.request.content.data;

  if (!data) return;

  const type = data.type as string | undefined;
  const orderId = data.orderId as string | undefined;
  const conversationId = data.conversationId as string | undefined;

  if (type === "chat_message" && conversationId) {
    router.push(`/conversation/${conversationId}`);
  } else if (orderId) {
    router.push(`/order/${orderId}`);
  }
}

export function addNotificationListeners(): () => void {
  if (isExpoGo()) return () => {};

  let cancelled = false;
  const subscriptions: { remove: () => void }[] = [];

  void import("expo-notifications").then((Notifications) => {
    if (cancelled) return;
    subscriptions.push(
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("Notification received in foreground:", notification.request.content.title);
      }),
    );
    subscriptions.push(
      Notifications.addNotificationResponseReceivedListener(handleNotificationResponse),
    );
  });

  return () => {
    cancelled = true;
    subscriptions.forEach((s) => s.remove());
  };
}

export async function handleInitialNotification(): Promise<void> {
  if (isExpoGo()) return;
  const Notifications = await import("expo-notifications");
  const response = await Notifications.getLastNotificationResponseAsync();

  if (response) {
    handleNotificationResponse(response);
  }
}

// ─── Permission Status Helpers ──────────────────────────────────────────────────

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (isExpoGo()) {
    return { granted: false, canAskAgain: false };
  }
  const Notifications = await import("expo-notifications");
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();

  return {
    granted: status === "granted",
    canAskAgain,
  };
}

/** True in Expo Go — remote push registration is not available (SDK 53+). */
export function isPushNotificationsUnavailableInExpoGo(): boolean {
  return isExpoGo();
}
