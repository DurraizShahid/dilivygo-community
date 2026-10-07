"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Star, Loader2, MessageSquare, Heart } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Skeleton,
  Input,
  formatPrice,
  useCurrency,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@dilivygo/ui";
import { cn } from "@dilivygo/ui";
import { useOrder } from "@/hooks/use-orders";
import { api } from "@/lib/api";
import {
  emptyOrderRatingForm,
  makeOrderRatingSchema,
  resolveTipCents,
  type OrderRatingFormInput,
} from "@/lib/schemas/order-rating";

function StarRating({
  value,
  onChange,
  label,
  error,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  error?: boolean;
}) {
  return (
    <div className="space-y-3">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={cn(
              "rounded-lg p-1 focus:outline-none focus:ring-2 focus:ring-ring transition-transform hover:scale-110",
              error && "ring-1 ring-destructive",
            )}
            aria-label={`${i} star${i > 1 ? "s" : ""}`}
          >
            <Star
              className={cn(
                "size-10 transition-colors",
                i <= value
                  ? "fill-current text-primary"
                  : "text-muted-foreground/25 hover:text-primary/70"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

const TIP_CENTS = [100, 200, 500];

export default function OrderRatePage() {
  const currency = useCurrency();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);

  const [existingReview, setExistingReview] = useState<{ rating: number; comment?: string | null } | null>(null);

  const shopNeeded = !!order?.shopId && !existingReview;
  const hasRider = !!order?.delivery?.riderId;

  const form = useForm<OrderRatingFormInput>({
    resolver: zodResolver(
      makeOrderRatingSchema({ shopNeeded, hasRider }),
    ),
    defaultValues: emptyOrderRatingForm(),
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!order?.id) return;
    api.reviews
      .getMyOrderReview(order.id)
      .then((review) => {
        if (!review) return;
        setExistingReview({ rating: review.rating, comment: review.comment });
        form.reset({
          ...form.getValues(),
          vendorRating: review.rating,
          comment: review.comment ?? "",
        });
      })
      .catch(() => {});
  }, [order?.id, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!order) return;
    const tipAmount = resolveTipCents(values);
    try {
      if (order.shopId && values.vendorRating > 0 && !existingReview) {
        await api.reviews.create({
          orderId: order.id,
          rating: values.vendorRating,
          comment: values.comment || undefined,
        });
      }
      if (order.delivery?.riderId && values.riderRating > 0) {
        await api.ratings.create({
          orderId: order.id,
          toUserId: order.delivery.riderId,
          toRole: "rider",
          rating: values.riderRating,
          comment: values.comment || undefined,
        });
      }
      if (order.delivery?.riderId && tipAmount > 0) {
        await api.tips.create({
          orderId: order.id,
          toRiderId: order.delivery.riderId,
          amountCents: tipAmount,
        });
      }
      router.push("/orders");
    } catch {
    }
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-8">
        <Skeleton className="h-9 w-1/3 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border/70 bg-muted/30 px-6 py-20 shadow-inner">
          <p className="text-muted-foreground">Order not found</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => router.push("/orders")}>
            Back to orders
          </Button>
        </div>
      </div>
    );
  }

  if (order.status !== "completed") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border/70 bg-muted/30 px-6 py-20 shadow-inner">
          <p className="text-muted-foreground">You can only rate completed orders.</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => router.push(`/orders/${id}`)}>
            Back to order
          </Button>
        </div>
      </div>
    );
  }

  const submitting = form.formState.isSubmitting;

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-16">
      {/* Back button */}
      <button
        onClick={() => router.push(`/orders/${id}`)}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to order
      </button>

      {/* Page header */}
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-sm">
          <Star className="size-5 fill-current" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">How was your order?</h1>
          <p className="text-sm text-muted-foreground">Order #{id.slice(0, 8)}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {/* Shop rating */}
          {order.shopId ? (
            <div className="rounded-2xl border border-border/60 bg-card/95 p-6 shadow-sm backdrop-blur-sm">
              <FormField
                control={form.control}
                name="vendorRating"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <StarRating
                      value={field.value}
                      onChange={(v) =>
                        field.onChange(v)
                      }
                      label="Rate the restaurant"
                      error={!!fieldState.error}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {existingReview && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Your shop review is already submitted. You can still tip or rate the rider if needed.
                </p>
              )}
            </div>
          ) : null}

          {/* Rider rating */}
          {hasRider && (
            <div className="rounded-2xl border border-border/60 bg-card/95 p-6 shadow-sm backdrop-blur-sm">
              <FormField
                control={form.control}
                name="riderRating"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <StarRating
                      value={field.value}
                      onChange={(v) => field.onChange(v)}
                      label="Rate the delivery / rider"
                      error={!!fieldState.error}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Comment */}
          <div className="rounded-2xl border border-border/60 bg-card/95 p-6 shadow-sm backdrop-blur-sm">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" />
              <span className="text-sm font-semibold">Comment (optional)</span>
            </div>
            <FormField
              control={form.control}
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <textarea
                      {...field}
                      placeholder="Tell us about your experience..."
                      rows={4}
                      className="flex w-full resize-none rounded-xl border border-input bg-transparent px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Tip */}
          {hasRider && (
            <div className="rounded-2xl border border-border/60 bg-card/95 p-6 shadow-sm backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2">
                <Heart className="size-4 text-primary" />
                <span className="text-sm font-semibold">Tip for rider (optional)</span>
              </div>
              <FormField
                control={form.control}
                name="tipCents"
                render={({ field: tipField }) => (
                  <FormItem className="space-y-2">
                    <FormControl>
                      <div className="flex flex-wrap gap-2">
                        {TIP_CENTS.map((cents) => (
                          <Button
                            key={cents}
                            type="button"
                            variant={tipField.value === cents ? "default" : "outline"}
                            size="sm"
                            className="rounded-full"
                            onClick={() => {
                              tipField.onChange(cents);
                              form.setValue("customTipCentsInput", "", {
                                shouldValidate: true,
                              });
                            }}
                          >
                            {formatPrice(cents, currency)}
                          </Button>
                        ))}
                        <FormField
                          control={form.control}
                          name="customTipCentsInput"
                          render={({ field: customField }) => (
                            <FormItem className="flex items-center gap-1.5 space-y-0">
                              <span className="text-sm text-muted-foreground">Custom:</span>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="0"
                                  className="w-20 rounded-xl"
                                  min={0}
                                  step={10}
                                  {...customField}
                                  onChange={(e) => {
                                    customField.onChange(e.target.value);
                                    form.setValue("tipCents", null, {
                                      shouldValidate: true,
                                    });
                                  }}
                                />
                              </FormControl>
                              <span className="text-xs text-muted-foreground">p</span>
                            </FormItem>
                          )}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          <Button
            type="submit"
            className="w-full gap-2 rounded-xl shadow-md shadow-primary/20"
            size="lg"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Submit feedback"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
