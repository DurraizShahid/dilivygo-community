import { api } from "@/lib/api";

type FirebaseApp = import("firebase/app").FirebaseApp;
type Messaging = import("firebase/messaging").Messaging;

let messagingSingleton: Messaging | null = null;
let appSingleton: FirebaseApp | null = null;

function readWebConfig():
  | { apiKey: string; authDomain: string; projectId: string; messagingSenderId: string; appId: string }
  | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const authDomain =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : "");
  if (!apiKey || !projectId || !messagingSenderId || !appId || !authDomain) return null;
  return { apiKey, authDomain, projectId, messagingSenderId, appId };
}

export function isVendorWebPushConfigured(): boolean {
  return !!readWebConfig() && !!(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "").trim();
}

async function getMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  const cfg = readWebConfig();
  if (!cfg) return null;

  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, isSupported } = await import("firebase/messaging");

  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  if (!appSingleton) {
    appSingleton = getApps().length ? getApps()[0]! : initializeApp(cfg);
  }
  if (!messagingSingleton) {
    messagingSingleton = getMessaging(appSingleton);
  }
  return messagingSingleton;
}

/**
 * Registers FCM web token with Dilivygo backend (platform `web`). Call after staff login.
 * No-ops when Firebase env is incomplete, API is missing, or the browser does not support FCM.
 */
export async function registerVendorWebPush(): Promise<boolean> {
  const vapidKey = (process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "").trim();
  if (!vapidKey || !isVendorWebPushConfigured()) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    await registration.update().catch(() => {});

    const messaging = await getMessaging();
    if (!messaging) return false;

    const { getToken } = await import("firebase/messaging");
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return false;

    await api.push.register(token, "web");
    return true;
  } catch {
    return false;
  }
}

export async function unregisterVendorWebPush(): Promise<void> {
  try {
    await api.push.unregister("web");
  } catch {
    /* ignore */
  }
  try {
    const messaging = await getMessaging();
    if (messaging) {
      const { deleteToken } = await import("firebase/messaging");
      await deleteToken(messaging);
    }
  } catch {
    /* ignore */
  }
  messagingSingleton = null;
}

export async function onVendorForegroundMessage(handler: (payload: import("firebase/messaging").MessagePayload) => void): Promise<(() => void) | null> {
  const messaging = await getMessaging();
  if (!messaging) return null;
  const { onMessage } = await import("firebase/messaging");
  return onMessage(messaging, handler);
}
