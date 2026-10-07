"use client";

import { createElement, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "@dilivygo/i18n";
import { useAuthStore } from "@/stores/auth-store";
import {
  isVendorWebPushConfigured,
  onVendorForegroundMessage,
  registerVendorWebPush,
} from "@/lib/vendor-web-push";

/**
 * After vendor login, requests notification permission (if needed), registers the FCM web token
 * with the API, and shows in-app toasts for foreground push messages.
 */
export function useVendorWebPush() {
  const { t } = useTranslation("vendor");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const registeredRef = useRef(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      registeredRef.current = false;
      unsubRef.current?.();
      unsubRef.current = null;
      return;
    }

    if (typeof window === "undefined" || !isVendorWebPushConfigured()) return;

    let cancelled = false;

    void (async () => {
      const ok = await registerVendorWebPush();
      if (cancelled) return;
      registeredRef.current = ok;
      if (ok) {
        toast.success(t("orders.push.desktopEnabledToast"), {
          duration: 4500,
          description: t("orders.push.desktopEnabledHint"),
          classNames: {
            toast: "!border-[#4ade80]/25 !bg-[#121a14]",
            description: "!text-white/70",
          },
        });
      }
      const unsub = await onVendorForegroundMessage((payload) => {
        const title = payload.notification?.title || "Dilivygo";
        const body = payload.notification?.body || "";
        toast.info(
          createElement("span", { className: "block font-semibold text-white" }, title),
          {
            description: body
              ? createElement(
                  "span",
                  { className: "text-[13px] leading-snug text-white/75" },
                  body,
                )
              : undefined,
            duration: 10_000,
            classNames: {
              toast:
                "vendor-sonner-order-update !w-[min(100vw-2rem,20rem)] !rounded-xl !border !border-[#38bdf8]/22 !bg-[#12161c] !p-4 !shadow-xl",
              title: "!mb-0",
              description: "!mt-1.5",
            },
          },
        );
      });
      if (cancelled) {
        unsub?.();
        return;
      }
      unsubRef.current = unsub;
    })();

    return () => {
      cancelled = true;
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [isAuthenticated, t]);
}
