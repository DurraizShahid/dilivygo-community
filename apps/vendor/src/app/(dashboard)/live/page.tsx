"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Loader2, Activity } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Badge, Button, OrderStatusBadge, PriceDisplay, Skeleton, buttonVariants, cn, Card, CardContent } from "@dilivygo/ui";
import type { Order } from "@dilivygo/types";
import { useTranslation } from "@dilivygo/i18n";
import { useOrders } from "@/hooks/use-orders";

const PIPELINE_STATUSES = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "assigned",
  "picked_up",
  "arrived",
  "completed",
] as const;

function countByStatus(orders: Order[]) {
  const m = new Map<string, number>();
  for (const o of orders) {
    const st = o.status || "unknown";
    m.set(st, (m.get(st) || 0) + 1);
  }
  return m;
}

export default function VendorLiveOpsPage() {
  const { t } = useTranslation("vendor");
  const { data: orders = [], isLoading, isFetching, refetch } = useOrders();

  const counts = useMemo(() => countByStatus(orders), [orders]);
  const activePipeline = useMemo(() => {
    return PIPELINE_STATUSES.reduce((acc, st) => acc + (counts.get(st) || 0), 0);
  }, [counts]);

  const recent = useMemo(() => {
    return [...orders]
      .sort((a, b) => {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      })
      .slice(0, 12);
  }, [orders]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 300, damping: 25 },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 text-foreground"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <motion.div variants={itemVariants} className="space-y-2">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <Activity className="size-4" />
            </motion.div>
            <h1 className="text-3xl font-semibold tracking-tight">{t("livePage.title")}</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("livePage.subtitle")}</p>
        </motion.div>
        <motion.div variants={itemVariants} className="flex items-center gap-2">
          <AnimatePresence>
            {isFetching && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              </motion.div>
            )}
          </AnimatePresence>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => refetch()}>
            {t("livePage.refresh")}
          </Button>
          <Link href="/orders" className={cn(buttonVariants({ size: "sm" }), "rounded-xl")}>
            {t("livePage.openOrders")}
          </Link>
        </motion.div>
      </header>

      <motion.section variants={itemVariants} className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6">
        <h2 className="text-sm font-semibold tracking-tight">{t("livePage.pipelineTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("livePage.pipelineHint")}</p>
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl bg-muted" />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="content"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {[
                { label: t("livePage.totalLoaded"), value: orders.length },
                { label: t("livePage.inPipeline"), value: activePipeline },
                { label: t("livePage.completed"), value: counts.get("completed") || 0 },
                {
                  label: t("livePage.cancelled"),
                  value: (counts.get("cancelled") || 0) + (counts.get("rejected") || 0),
                },
              ].map((stat, idx) => (
                <motion.div
                  key={idx}
                  variants={itemVariants}
                  whileHover={{ y: -2 }}
                  className="rounded-xl border border-border bg-muted/20 px-4 py-3 shadow-sm transition-colors hover:border-primary/20 hover:bg-muted/30"
                >
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      <motion.section variants={itemVariants} className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6">
        <h2 className="text-sm font-semibold tracking-tight">{t("livePage.byStatusTitle")}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full"
              >
                <Skeleton className="h-24 w-full bg-muted" />
              </motion.div>
            ) : (
              <motion.div
                key="badges"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-wrap gap-2"
              >
                {PIPELINE_STATUSES.map((st) => {
                  const n = counts.get(st) || 0;
                  if (n === 0) return null;
                  return (
                    <motion.div key={st} variants={itemVariants} layout>
                      <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1.5 text-xs">
                        <span className="capitalize">{st.replace(/_/g, " ")}</span>
                        <span className="tabular-nums font-semibold">{n}</span>
                      </Badge>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">{t("livePage.recentTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("livePage.recentHint")}</p>
          </div>
          <Link
            href="/orders"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0 gap-1 rounded-xl")}
          >
            {t("livePage.viewAll")}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4"
            >
              <Skeleton className="h-40 w-full rounded-xl bg-muted" />
            </motion.div>
          ) : recent.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 p-8 text-center text-sm text-muted-foreground"
            >
              {t("livePage.empty")}
            </motion.div>
          ) : (
            <motion.ul
              key="list"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="mt-4 divide-y divide-border rounded-xl border border-border"
            >
              {recent.map((order) => (
                <motion.li
                  key={order.id}
                  variants={itemVariants}
                  layout
                  className="group flex flex-col gap-2 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        #{order.id.slice(0, 8)}
                      </Link>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleString()
                        : t("livePage.noTimestamp")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <PriceDisplay cents={order.totalCents} className="text-sm font-semibold" />
                    <Link
                      href={`/orders/${order.id}`}
                    >
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl")}
                      >
                        {t("livePage.open")}
                      </motion.div>
                    </Link>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
}
