import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FCM_JS = "11.1.0";

function firebaseConfigLiteral(): string | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;
  return JSON.stringify({
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    messagingSenderId,
    appId,
  });
}

/**
 * Service worker script for FCM web push (registered at `/firebase-messaging-sw.js`).
 * Config is injected from env so the same backend FCM project can reach vendor browsers.
 */
export async function GET() {
  const cfg = firebaseConfigLiteral();
  if (!cfg) {
    return new NextResponse(
      "// Dilivygo: set NEXT_PUBLIC_FIREBASE_* env vars to enable vendor web push.\n",
      {
        status: 503,
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      },
    );
  }

  const body = `importScripts('https://www.gstatic.com/firebasejs/${FCM_JS}/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/${FCM_JS}/firebase-messaging-compat.js');
firebase.initializeApp(${cfg});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(function (payload) {
  var title = (payload.notification && payload.notification.title) || 'Dilivygo';
  var bodyText = (payload.notification && payload.notification.body) || '';
  var data = payload.data || {};
  return self.registration.showNotification(title, {
    body: bodyText,
    data: data,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
  });
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var orderId = event.notification.data && event.notification.data.orderId;
  var path = orderId ? '/orders/' + orderId : '/orders';
  var url = self.location.origin + path;
  event.waitUntil(clients.openWindow(url));
});
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
