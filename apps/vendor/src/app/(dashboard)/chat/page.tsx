"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { 
  ChatCircleText, 
  CaretRight, 
  User, 
  Truck, 
  ShoppingBag,
  Clock,
  Circle,
  Hash
} from "@phosphor-icons/react";
import {
  Card,
  CardContent,
  Skeleton,
  EmptyState,
  cn,
} from "@dilivygo/ui";
import { useConversations } from "@/hooks/use-chat";
import { useTranslation } from "@dilivygo/i18n";

export default function ChatListPage() {
  const { t } = useTranslation("vendor");
  const { data: conversations, isLoading } = useConversations();

  const containerVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.25, 1, 0.5, 1] as const,
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 5 },
    visible: { opacity: 1, y: 0 },
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 lg:px-8">
        <div className="space-y-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const activeChats = conversations?.length ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-8 lg:px-8">
      {/* Header */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-8"
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("chat.listTitle")}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t("chat.listSubtitle")}
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <motion.div variants={itemVariants}>
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ChatCircleText className="size-4 text-primary" weight="duotone" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Active Threads</span>
              </div>
              <span className="text-2xl font-bold">{activeChats}</span>
            </div>
          </motion.div>
          <motion.div variants={itemVariants}>
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" weight="duotone" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Response Time</span>
              </div>
              <span className="text-2xl font-bold">~2m</span>
            </div>
          </motion.div>
          <motion.div variants={itemVariants}>
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Circle className="size-2 text-green-500 fill-green-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Support Online</span>
              </div>
              <span className="text-2xl font-bold">Ready</span>
            </div>
          </motion.div>
        </div>

        {/* Conversations List */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <ChatCircleText className="size-4 text-primary" weight="duotone" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
              Recent Conversations
            </h2>
          </div>

          <AnimatePresence mode="wait">
            {!conversations || conversations.length === 0 ? (
              <motion.div
                key="empty"
                variants={itemVariants}
                className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-muted/5 py-20 text-center"
              >
                <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/20">
                  <ChatCircleText className="size-8 text-muted-foreground/40" weight="duotone" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">{t("chat.noConversations")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t("chat.emptyListDescription")}</p>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                className="space-y-3"
                variants={containerVariants}
              >
                {conversations.map((conv) => (
                  <motion.div
                    key={conv.id}
                    variants={itemVariants}
                    layout
                    className="group"
                  >
                    <Link href={`/chat/${conv.id}`} className="block">
                      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.995]">
                        <div className="flex items-center justify-between p-5">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "flex size-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110 group-hover:rotate-3",
                              conv.type === "customer_vendor" ? "bg-primary/10" : "bg-amber-500/10"
                            )}>
                              {conv.type === "customer_vendor" ? (
                                <User className="size-6 text-primary" weight="duotone" />
                              ) : (
                                <Truck className="size-6 text-amber-600" weight="duotone" />
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-bold tracking-tight">
                                {conv.type === "customer_vendor"
                                  ? t("chat.roleCustomer")
                                  : conv.type === "vendor_rider"
                                    ? t("chat.roleRider")
                                    : conv.type === "customer_rider"
                                      ? t("chat.roleDeliveryThread")
                                      : t("chat.roleRider")}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                                  <Hash className="size-3" />
                                  {conv.orderId ? conv.orderId.slice(0, 8) : "General"}
                                </div>
                                <span className="size-1 rounded-full bg-border" />
                                <span className="text-[10px] font-medium text-muted-foreground/80">
                                  {conv.orderId ? "Order Inquiry" : "Support Thread"}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="hidden flex-col items-end gap-0.5 sm:flex">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Last Message</span>
                              <span className="text-xs text-muted-foreground">
                                Just now
                              </span>
                            </div>
                            <CaretRight className="size-4 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
