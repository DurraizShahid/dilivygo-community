"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  ChevronRight,
  ArrowLeft,
  Headphones,
  Plus,
  Loader2,
  Store,
  Bike,
  Info,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
  Textarea,
  useCustomerRefundRequestsEnabled,
} from "@dilivygo/ui";
import { useLanguage, useTranslation } from "@dilivygo/i18n";
import { useConversations } from "@/hooks/use-chat";
import { useAuthStore } from "@/stores/auth-store";
import { PromoBanner } from "@/components/promo-banner";
import { api } from "@/lib/api";
import type { Conversation } from "@dilivygo/types";
import {
  supportTicketSchema,
  type SupportTicketInput,
} from "@/lib/schemas/ticket";

function formatListTime(iso: string, locale: string) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function convMeta(conv: Conversation) {
  const isSupport = conv.type === "customer_support";
  const title = isSupport
    ? conv.supportSubject || "Support"
    : conv.type === "customer_vendor"
      ? "Restaurant"
      : conv.type === "customer_rider"
        ? "Rider"
        : "Rider";
  const subtitle = isSupport
    ? "Platform support"
    : conv.orderId
      ? `Order #${conv.orderId.slice(0, 8)}`
      : "Order chat";
  const Icon =
    conv.type === "customer_support"
      ? Headphones
      : conv.type === "customer_rider" || conv.type === "vendor_rider"
        ? Bike
        : conv.type === "customer_vendor"
          ? Store
          : MessageCircle;
  const badge = isSupport ? "Support" : "Order";
  const badgeVariant = isSupport ? "default" as const : "secondary" as const;
  const supportEnded =
    isSupport && Boolean(conv.supportClosedAt);
  return { title, subtitle, Icon, badge, badgeVariant, supportEnded };
}

export default function ChatListPage() {
  const { language } = useLanguage();
  const { t } = useTranslation("customer");
  const refundRequestsEnabled = useCustomerRefundRequestsEnabled();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ticketOpen, setTicketOpen] = useState(false);

  const ticketForm = useForm<SupportTicketInput>({
    resolver: zodResolver(supportTicketSchema),
    defaultValues: { subject: "", message: "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  const { data: conversations, isLoading } = useConversations();

  async function onCreateTicket(values: SupportTicketInput) {
    try {
      const { conversation } = await api.chat.createSupportTicket({
        subject: values.subject,
        message: values.message,
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setTicketOpen(false);
      ticketForm.reset({ subject: "", message: "" });
      router.push(`/chat/${conversation.id}`);
    } catch {
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 lg:px-8">
        <Skeleton className="h-24 w-full rounded-2xl" />
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const sortedConversations = conversations
    ? [...conversations].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-[calc(100vh-6rem)] bg-gradient-to-b from-muted/25 via-background to-background"
    >
      <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
        <PromoBanner placement="chat_list" />

        <header className="mb-8 mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <motion.button
              type="button"
              onClick={() => router.back()}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="mt-0.5 flex size-10 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Go back"
            >
              <ArrowLeft className="size-5" />
            </motion.button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Support tickets and chats with restaurants or riders on your orders.
              </p>
            </div>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              type="button"
              className="gap-2 rounded-xl shadow-sm"
              onClick={() => setTicketOpen(true)}
            >
              <Plus className="size-4" />
              New support ticket
            </Button>
          </motion.div>
        </header>

        {!isLoading && refundRequestsEnabled ? (
          <div
            className="mb-6 flex gap-3 rounded-2xl border border-border/60 bg-muted/35 px-4 py-3 text-sm text-muted-foreground shadow-inner"
            role="status"
          >
            <Info
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden
            />
            <p className="leading-relaxed">{t("supportChat.refundInboxHint")}</p>
          </div>
        ) : null}

        <Dialog
          open={ticketOpen}
          onOpenChange={(open) => {
            setTicketOpen(open);
            if (!open) ticketForm.reset({ subject: "", message: "" });
          }}
        >
          <DialogContent className="gap-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-2xl sm:max-w-[440px]">
            <div className="relative overflow-hidden bg-gradient-to-br from-primary/18 via-primary/8 to-muted/30 px-6 pb-6 pt-8 dark:from-primary/25 dark:via-primary/12 dark:to-muted/20">
              <div
                className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-primary/15 blur-3xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute bottom-0 left-1/2 h-24 w-[120%] -translate-x-1/2 bg-gradient-to-t from-background to-transparent"
                aria-hidden
              />
              <DialogHeader className="relative space-y-3 text-left">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-background/90 shadow-md ring-1 ring-border/50 backdrop-blur-sm dark:bg-background/70">
                  <Headphones className="size-7 text-primary" aria-hidden />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold tracking-tight">
                    New support ticket
                  </DialogTitle>
                  <DialogDescription className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
                    Tell us what you need. Our team will reply in this chat as soon as they can.
                  </DialogDescription>
                </div>
              </DialogHeader>
            </div>

            <Form {...ticketForm}>
              <form
                onSubmit={ticketForm.handleSubmit(onCreateTicket)}
                className="border-t border-border/40 bg-background"
              >
                <div className="space-y-5 p-5 sm:p-6">
                  <FormField
                    control={ticketForm.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <FormLabel
                            htmlFor="ticket-subject"
                            className="text-sm font-semibold text-foreground"
                          >
                            Subject
                          </FormLabel>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {field.value.length}/200
                          </span>
                        </div>
                        <FormControl>
                          <Input
                            id="ticket-subject"
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            placeholder="Short summary, e.g. refund on order #1234"
                            maxLength={200}
                            autoComplete="off"
                            disabled={ticketForm.formState.isSubmitting}
                            className="h-11 rounded-xl border-border/60 bg-muted/30 shadow-inner transition-colors focus-visible:bg-background dark:bg-muted/20"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={ticketForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel
                          htmlFor="ticket-message"
                          className="text-sm font-semibold text-foreground"
                        >
                          Your message
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            id="ticket-message"
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            placeholder="Include any order numbers, dates, or details that help us help you faster…"
                            rows={5}
                            disabled={ticketForm.formState.isSubmitting}
                            className="min-h-[140px] resize-y rounded-xl border-border/60 bg-muted/30 text-[15px] leading-relaxed shadow-inner transition-colors focus-visible:bg-background dark:bg-muted/20"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter className="gap-3 border-t border-border/50 bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-border/70"
                    onClick={() => setTicketOpen(false)}
                    disabled={ticketForm.formState.isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={ticketForm.formState.isSubmitting}
                    className="gap-2 rounded-xl shadow-md shadow-primary/20"
                  >
                    {ticketForm.formState.isSubmitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Starting chat…
                      </>
                    ) : (
                      <>
                        <MessageCircle className="size-4" />
                        Start chat
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[88px] w-full rounded-2xl" />
              ))}
            </motion.div>
          ) : sortedConversations.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-border/60 bg-card/40 px-6 py-20 text-center shadow-inner"
            >
              <div className="relative">
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 0.2, scale: 1 }}
                  className="absolute inset-0 rounded-full bg-primary/20 blur-xl"
                />
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="relative flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/15"
                >
                  <Headphones className="size-11 text-primary" />
                </motion.div>
              </div>
              <h3 className="mt-8 text-lg font-semibold">No conversations yet</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Open a support ticket anytime, or start a chat from an active order with the
                restaurant or your rider.
              </p>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  type="button"
                  className="mt-8 gap-2 rounded-xl"
                  onClick={() => setTicketOpen(true)}
                >
                  <Plus className="size-4" />
                  New support ticket
                </Button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.ul
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2.5"
            >
              <AnimatePresence initial={false}>
                {sortedConversations.map((conv, idx) => {
                  const { title, subtitle, Icon, badge, badgeVariant, supportEnded } =
                    convMeta(conv);
                  return (
                    <motion.li
                      layout
                      key={conv.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Link
                        href={`/chat/${conv.id}`}
                        className={cn(
                          "group flex items-center gap-4 rounded-2xl border border-border/50 bg-card p-4 shadow-sm transition-all",
                          "hover:border-primary/25 hover:shadow-md hover:ring-1 hover:ring-primary/10"
                        )}
                      >
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 transition-transform group-hover:scale-[1.02]">
                          <Icon className="size-7 text-primary" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold tracking-tight">{title}</span>
                            <Badge variant={badgeVariant} className="text-[10px] font-semibold uppercase">
                              {badge}
                            </Badge>
                            {supportEnded ? (
                              <Badge
                                variant="outline"
                                className="border-muted-foreground/40 text-[10px] font-semibold text-muted-foreground"
                              >
                                Ended
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className="text-[11px] tabular-nums text-muted-foreground"
                            suppressHydrationWarning
                          >
                            {formatListTime(conv.updatedAt, language)}
                          </span>
                          <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </Link>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
