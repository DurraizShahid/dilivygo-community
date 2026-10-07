"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { Button } from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { useAuthStore } from "@/stores/auth-store";

function firstDisplayName(full: string): string {
  const t = full.trim();
  if (!t) return t;
  return t.split(/\s+/)[0] ?? t;
}

export function HeroBanner() {
  const { t } = useTranslation("customer");
  const customer = useAuthStore((s) => s.customer);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const greetingName = useMemo(() => {
    const raw = customer?.name?.trim();
    if (!raw) return null;
    return firstDisplayName(raw);
  }, [customer?.name]);

  function scrollToBrowse() {
    document.getElementById("browse-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleCouponClick() {
    scrollToBrowse();
  }

  return (
    <section
      className="bg-transparent pb-2 pt-6 sm:pt-8"
      aria-labelledby="hero-heading"
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex flex-col gap-5">
          <div className="min-w-0 flex-1">
            <h1
              id="hero-heading"
              className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              {isAuthenticated && greetingName
                ? t("home.dashboardGreeting", { name: greetingName })
                : t("home.dashboardGreetingGuest")}
              <motion.span
                className="ml-1.5 inline-block"
                aria-hidden
                animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  repeatDelay: 1.5,
                  ease: "easeInOut",
                }}
              >
                👋
              </motion.span>
            </h1>
            <p className="mt-2 text-lg font-semibold text-primary sm:text-xl">
              {t("home.dashboardTagline")}
            </p>
          </div>
        </div>

        <motion.div
          className="mt-8 flex flex-col overflow-hidden rounded-[20px] bg-primary shadow-lg shadow-primary/20 sm:mt-10 lg:min-h-[200px] lg:flex-row lg:items-stretch"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <div className="flex flex-1 flex-col justify-center px-6 py-7 sm:px-8 sm:py-8 lg:max-w-[55%] lg:py-10">
            <p className="text-pretty text-xl font-extrabold leading-snug text-primary-foreground sm:text-2xl lg:text-[1.65rem] lg:leading-tight">
              {t("home.promoBannerTitle")}
            </p>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-fit">
              <Button
                type="button"
                onClick={handleCouponClick}
                className="mt-5 h-11 w-fit min-w-[140px] rounded-full border-0 bg-primary-foreground px-8 text-sm font-bold text-primary shadow-md transition-colors hover:bg-muted"
              >
                {t("home.getCoupon")}
              </Button>
            </motion.div>
          </div>
          <div className="relative flex min-h-[160px] flex-1 items-end justify-center pb-2 pt-4 sm:min-h-[180px] lg:min-h-0 lg:items-center lg:pb-4 lg:pt-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- local public SVG asset */}
            <motion.img
              src="/banner.svg"
              alt=""
              className="h-auto w-full max-w-[220px] object-contain sm:max-w-[280px] lg:max-w-[min(340px,90%)]"
              width={340}
              height={260}
              decoding="async"
              animate={{
                y: [0, -10, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
