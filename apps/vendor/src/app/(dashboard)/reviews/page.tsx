"use client";

import { useQuery } from "@tanstack/react-query";
import { 
  Star, 
  ChatCircleText, 
  Info, 
  WarningCircle, 
  Clock, 
  CaretRight, 
  Quotes,
  User,
  Smiley,
  SmileySad,
  SmileyMeh
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  EmptyState, 
  Skeleton,
  Button,
  Separator,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  cn
} from "@dilivygo/ui";
import { api } from "@/lib/api";
import { useShopStore } from "@/stores/shop-store";
import { useTranslation } from "@dilivygo/i18n";
import { useState } from "react";
import type { ShopReview } from "@dilivygo/types";

function RatingIcon({ rating }: { rating: number }) {
  if (rating >= 4) return <Smiley className="size-5 text-green-500" weight="duotone" />;
  if (rating >= 2.5) return <SmileyMeh className="size-5 text-amber-500" weight="duotone" />;
  return <SmileySad className="size-5 text-red-500" weight="duotone" />;
}

export default function VendorReviewsPage() {
  const { t } = useTranslation("vendor");
  const activeShop = useShopStore((s) => s.activeShop);
  const [selectedReview, setSelectedReview] = useState<ShopReview | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-reviews", activeShop?.id],
    queryFn: () => api.reviews.listShop({ shopId: activeShop!.id, limit: 200 }),
    enabled: !!activeShop?.id,
  });

  if (!activeShop) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
        <EmptyState
          icon={<ChatCircleText className="size-12 text-muted-foreground/40" weight="duotone" />}
          title={t("reviews.selectShopTitle")}
          description={t("reviews.selectShopDescription")}
        />
      </div>
    );
  }

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

  const reviews = data?.reviews ?? [];
  const summary = data?.summary;

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
          <h1 className="text-3xl font-bold tracking-tight">{t("reviews.pageTitle")}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t("reviews.pageSubtitle")}
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <motion.div variants={itemVariants}>
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Star className="size-4 text-amber-500" weight="duotone" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Average Rating</span>
              </div>
              <span className="text-2xl font-bold">{(summary?.averageRating ?? 0).toFixed(1)}</span>
            </div>
          </motion.div>
          <motion.div variants={itemVariants}>
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ChatCircleText className="size-4 text-primary" weight="duotone" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Total Reviews</span>
              </div>
              <span className="text-2xl font-bold">{summary?.reviewCount ?? 0}</span>
            </div>
          </motion.div>
          <motion.div variants={itemVariants}>
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" weight="duotone" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Last 30 Days</span>
              </div>
              <span className="text-2xl font-bold">{reviews.filter(r => {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return new Date(r.createdAt) > thirtyDaysAgo;
              }).length}</span>
            </div>
          </motion.div>
        </div>

        {/* Reviews List */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Quotes className="size-4 text-primary" weight="duotone" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
              Activity Stream
            </h2>
          </div>

          <AnimatePresence mode="wait">
            {reviews.length === 0 ? (
              <motion.div
                key="empty"
                variants={itemVariants}
                className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-muted/5 py-20 text-center"
              >
                <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/20">
                  <ChatCircleText className="size-8 text-muted-foreground/40" weight="duotone" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">{t("reviews.noReviews")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t("reviews.emptyDescription")}</p>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                className="space-y-3"
                variants={containerVariants}
              >
                {reviews.map((review) => (
                  <Dialog key={review.id}>
                    <DialogTrigger asChild>
                      <motion.div
                        variants={itemVariants}
                        className="group cursor-pointer"
                        onClick={() => setSelectedReview(review)}
                      >
                        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                          <div className="flex items-center justify-between p-5">
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "flex size-10 items-center justify-center rounded-xl",
                                review.rating >= 4 ? "bg-green-500/10" : review.rating >= 2.5 ? "bg-amber-500/10" : "bg-red-500/10"
                              )}>
                                <RatingIcon rating={review.rating} />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold">
                                    {review.rating.toFixed(1)} / 5.0
                                  </span>
                                  {review.moderationStatus === "hidden" && (
                                    <Badge variant="outline" className="h-4.5 rounded-md border-amber-500/30 px-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                      Hidden
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="line-clamp-1 max-w-[200px] sm:max-w-[400px]">
                                    {review.comment || t("reviews.noWrittenComment")}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="hidden flex-col items-end gap-0.5 sm:flex">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Received</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(review.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <CaretRight className="size-4 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Review Details</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-6 py-4">
                        <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/20 p-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "flex size-12 items-center justify-center rounded-xl",
                              review.rating >= 4 ? "bg-green-500/10" : review.rating >= 2.5 ? "bg-amber-500/10" : "bg-red-500/10"
                            )}>
                              <RatingIcon rating={review.rating} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-lg font-bold">{review.rating.toFixed(1)} / 5.0</span>
                              <span className="text-xs text-muted-foreground">Rating from customer</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {new Date(review.createdAt).toLocaleDateString()}
                            </div>
                            <div>{new Date(review.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>

                        <div className="space-y-2 px-1">
                          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                            <ChatCircleText className="size-3" />
                            Comment
                          </div>
                          <div className="relative rounded-2xl border border-border/60 bg-card p-6 italic leading-relaxed text-foreground shadow-sm">
                            <Quotes className="absolute -left-2 -top-2 size-6 text-primary/10" weight="fill" />
                            {review.comment || t("reviews.noWrittenComment")}
                          </div>
                        </div>

                        {review.moderationStatus === "hidden" && (
                          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                              <WarningCircle className="size-3" weight="duotone" />
                              Moderation Info
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-amber-700/80 dark:text-amber-300/80">
                              {review.moderationReason
                                ? t("reviews.hiddenWithReason", { reason: review.moderationReason })
                                : t("reviews.hiddenBySuperadmin")}
                            </p>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-muted/10 p-4">
                          <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                            <User className="size-4 text-muted-foreground" weight="duotone" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Customer</span>
                            <span className="text-xs font-medium">Anonymous Customer</span>
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline" className="h-11 rounded-xl">Close Inspector</Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function Badge({ children, className, variant = "default" }: { children: React.ReactNode, className?: string, variant?: "default" | "outline" | "secondary" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
      variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/80",
      variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      variant === "outline" && "text-foreground border border-border",
      className
    )}>
      {children}
    </span>
  );
}

function DialogFooter({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}>
      {children}
    </div>
  );
}
