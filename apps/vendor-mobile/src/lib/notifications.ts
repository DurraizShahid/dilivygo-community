import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { router } from "expo-router";
import type { PushPlatform } from "@dilivygo/types";
import { api } from "./api";
import { getVendorRealtimeStore } from "@/stores/vendor-realtime-store";

type ExpoNotifications = typeof import("expo-notifications");

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export interface PushTokenResult {
  token: string | null;
  error?: string;
}

type NotificationResponseLike = {
  notification: { request: { content: { data?: Record<string, unknown> } } };
};

const VENDOR_ORDER_LIGHT = "#ff8c69";

export async function registerForPushNotifications(): Promise<PushTokenResult> {
  if (isExpoGo()) {
    return { token: null };
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
      await setupAndroidNotificationChannels(Notifications);
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
  await api.push.register(token, platform);
}

export async function unregisterPushToken(): Promise<void> {
  const platform: PushPlatform = Platform.OS === "ios" ? "ios" : "android";
  try {
    await api.push.unregister(platform);
  } catch (error) {
    console.error("Failed to unregister push token:", error);
  }
}

async function setupAndroidNotificationChannels(Notifications: ExpoNotifications): Promise<void> {
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: VENDOR_ORDER_LIGHT,
  });

  await Notifications.setNotificationChannelAsync("vendor_orders", {
    name: "New orders",
    description: "Alerts when customers place orders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: VENDOR_ORDER_LIGHT,
    sound: "default",
  });

  await Notifications.setNotificationChannelAsync("chat", {
    name: "Chat",
    description: "Vendor chat messages",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

function vendorNotificationShouldShow(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const type = data.type as string | undefined;
  return (
    type === "new_order_vendor" ||
    type === "chat_message" ||
    type === "order_delayed" ||
    type === "cx_case" ||
    type === "cx_anomaly" ||
    false
  );
}

export function setupNotificationHandlers(): void {
  if (isExpoGo()) return;
  void import("expo-notifications").then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        const shouldShow = vendorNotificationShouldShow(data);
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
    return;
  }

  // Tenant/session safe: ids are validated as UUIDs and every target
  // screen re-authenticates (staff JWT + assigned-shop scope) on load.
  if (type === "cx_case" && typeof data.caseId === "string" && /^[0-9a-f-]{8,}$/i.test(data.caseId)) {
    router.push(`/cx/cases/${data.caseId}`);
    return;
  }

  if (type === "cx_anomaly") {
    router.push("/cx/cases");
    return;
  }

  if (orderId && (type === "new_order_vendor" || type === "order_delayed")) {
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
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        const type = data?.type as string | undefined;
        const orderId = data?.orderId as string | undefined;
        if (type === "new_order_vendor" && orderId) {
          getVendorRealtimeStore().setPendingPushOrderId(orderId);
        }
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
