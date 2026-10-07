"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  AnimatedTbody,
  Badge,
  Skeleton,
  formatPrice,
  useCurrency,
  buttonVariants,
  cn,
} from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import { useShopStore } from "@/stores/shop-store";
import type { Product } from "@dilivygo/types";

export default function VendorMenuInsightsPage() {
  const { t } = useTranslation("vendor");
  const currency = useCurrency();
  const activeShop = useShopStore((s) => s.activeShop);
  const shopId = activeShop?.id;

  const { data: catData, isLoading: catLoading } = useQuery({
    queryKey: ["catalog-categories", shopId],
    queryFn: () => api.catalog.listCategories(shopId!),
    enabled: !!shopId,
  });

  const { data: prodData, isLoading: prodLoading } = useQuery({
    queryKey: ["catalog-products-insights", shopId],
    queryFn: () => api.catalog.listProducts({ includeUnavailable: true }, shopId!),
    enabled: !!shopId,
  });

  const categories = catData?.categories ?? [];
  const products = (prodData as { products?: Product[] } | undefined)?.products ?? [];

  const stats = useMemo(() => {
    const available = products.filter((p) => p.available).length;
    const unavailable = products.length - available;
    const withModifiers = products.filter((p) => (p.modifierGroups?.length ?? 0) > 0).length;
    const withDietary = products.filter((p) => (p.dietaryTags?.length ?? 0) > 0).length;
    const withImage = products.filter((p) => !!p.imageUrl).length;
    const byCategory = new Map<string, number>();
    for (const p of products) {
      const key = p.category?.trim() || t("menuInsightsPage.uncategorized");
      byCategory.set(key, (byCategory.get(key) || 0) + 1);
    }
    const topCategories = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    return {
      available,
      unavailable,
      withModifiers,
      withDietary,
      withImage,
      topCategories,
    };
  }, [products, t]);

  const isLoading = !!shopId && (catLoading || prodLoading);

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
      <header className="space-y-2">
        <motion.h1 variants={itemVariants} className="text-3xl font-semibold tracking-tight">
          {t("menuInsightsPage.title")}
        </motion.h1>
        <motion.p variants={itemVariants} className="max-w-2xl text-sm text-muted-foreground">
          {t("menuInsightsPage.subtitle")}
        </motion.p>
        {!shopId ? (
          <motion.p variants={itemVariants} className="pt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
            {t("menuInsightsPage.pickShop")}
          </motion.p>
        ) : (
          <motion.p variants={itemVariants} className="pt-1 text-xs text-muted-foreground">
            {t("menuInsightsPage.shopScope", { name: activeShop?.name ?? "" })}
          </motion.p>
        )}
      </header>

      {!shopId ? (
        <motion.section variants={itemVariants} className="dashboard-glass-panel rounded-[24px] p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("menuInsightsPage.emptyShop")}</p>
        </motion.section>
      ) : (
        <>
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.section
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-[24px] bg-muted" />
                ))}
              </motion.section>
            ) : (
              <motion.section
                key="stats"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {[
                  { label: t("menuInsightsPage.totalProducts"), value: products.length, color: "" },
                  { label: t("menuInsightsPage.available"), value: stats.available, color: "text-emerald-600 dark:text-emerald-400" },
                  { label: t("menuInsightsPage.unavailable"), value: stats.unavailable, color: "text-amber-600 dark:text-amber-400" },
                  { label: t("menuInsightsPage.categories"), value: categories.length, color: "" },
                  { label: t("menuInsightsPage.withModifiers"), value: stats.withModifiers, color: "" },
                  { label: t("menuInsightsPage.withPhotos"), value: stats.withImage, color: "" },
                ].map((stat, idx) => (
                  <motion.div
                    key={idx}
                    variants={itemVariants}
                    whileHover={{ y: -2 }}
                    className="dashboard-glass-panel rounded-[24px] p-5 shadow-sm transition-colors hover:bg-muted/30"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className={cn("mt-1 text-3xl font-bold tabular-nums", stat.color)}>
                      {stat.value}
                    </p>
                  </motion.div>
                ))}
              </motion.section>
            )}
          </AnimatePresence>

          <motion.section variants={itemVariants} className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6">
            <h2 className="text-sm font-semibold tracking-tight">{t("menuInsightsPage.byCategoryTitle")}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                    <Skeleton className="h-16 w-full bg-muted" />
                  </motion.div>
                ) : stats.topCategories.length === 0 ? (
                  <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-muted-foreground">
                    {t("menuInsightsPage.noProducts")}
                  </motion.p>
                ) : (
                  <motion.div
                    key="badges"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-wrap gap-2"
                  >
                    {stats.topCategories.map(([name, n]) => (
                      <motion.div key={name} variants={itemVariants}>
                        <Badge variant="secondary" className="rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-primary/10">
                          <span className="max-w-[160px] truncate">{name}</span>
                          <span className="ml-1.5 tabular-nums font-semibold text-primary">{n}</span>
                        </Badge>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>

          <motion.section variants={itemVariants} className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">{t("menuInsightsPage.priceTitle")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t("menuInsightsPage.priceHint")}</p>
              </div>
              <Link href="/menu">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(buttonVariants({ size: "sm" }), "w-fit rounded-xl")}
                >
                  {t("menuInsightsPage.editMenu")}
                </motion.div>
              </Link>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-background/50 backdrop-blur-sm">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("menuInsightsPage.colProduct")}</th>
                    <th className="px-4 py-3 font-medium">{t("menuInsightsPage.colCategory")}</th>
                    <th className="px-4 py-3 font-medium">{t("menuInsightsPage.colPrice")}</th>
                    <th className="px-4 py-3 font-medium">{t("menuInsightsPage.colAvailability")}</th>
                    <th className="px-4 py-3 font-medium">{t("menuInsightsPage.colTags")}</th>
                  </tr>
                </thead>
                <AnimatedTbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8">
                        <Skeleton className="h-48 w-full bg-muted" />
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        {t("menuInsightsPage.noProducts")}
                      </td>
                    </tr>
                  ) : (
                    [...products]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .slice(0, 40)
                      .map((p) => (
                        <motion.tr
                          key={p.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/20"
                        >
                          <td className="max-w-[200px] truncate px-4 py-2.5 font-medium">{p.name}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{p.category || "—"}</td>
                          <td className="px-4 py-2.5 tabular-nums">{formatPrice(p.priceCents, currency)}</td>
                          <td className="px-4 py-2.5">
                            <Badge
                              variant={p.available ? "default" : "secondary"}
                              className="rounded-full text-[10px]"
                            >
                              {p.available ? t("menuInsightsPage.stockIn") : t("menuInsightsPage.stockOut")}
                            </Badge>
                          </td>
                          <td className="max-w-[140px] truncate px-4 py-2.5 text-xs text-muted-foreground">
                            {(p.dietaryTags ?? []).join(", ") || "—"}
                          </td>
                        </motion.tr>
                      ))
                  )}
                </AnimatedTbody>
              </table>
            </div>
            {products.length > 40 ? (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-center text-xs text-muted-foreground">
                {t("menuInsightsPage.tableTruncated", { count: products.length })}
              </motion.p>
            ) : null}
          </motion.section>
        </>
      )}
    </motion.div>
  );
}
