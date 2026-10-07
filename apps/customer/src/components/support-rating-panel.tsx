"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Button, Textarea, cn, Skeleton } from "@dilivygo/ui";
import { api } from "@/lib/api";

export function SupportRatingPanel({
  conversationId,
}: {
  conversationId: string;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["support-rating", conversationId],
    queryFn: () => api.chat.getSupportRating(conversationId),
  });

  const rating = data?.rating;
  const locked = Boolean(rating);
  const [draftStars, setDraftStars] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (rating?.comment) setComment(rating.comment);
    else if (!rating) setComment("");
  }, [rating?.id, rating?.comment, rating]);

  const highlightStars =
    locked && rating ? rating.stars : draftStars ?? rating?.stars ?? 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const stars = draftStars ?? rating?.stars;
      if (!stars || stars < 1) throw new Error("Tap a star rating first.");
      return api.chat.putSupportRating(conversationId, {
        stars,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-rating", conversationId] });
      setDraftStars(null);
    },
    onError: () => {},
  });

  if (isLoading) {
    return (
      <div className="shrink-0 border-t border-border/50 bg-gradient-to-b from-muted/40 to-muted/15 px-4 py-4 lg:px-8">
        <Skeleton className="h-4 w-48 rounded-md" />
        <Skeleton className="mt-3 h-24 w-full rounded-xl" />
      </div>
    );
  }

  const canSubmit = !locked && (draftStars ?? 0) >= 1;

  return (
    <div className="shrink-0 border-t border-border/50 bg-gradient-to-b from-muted/35 via-muted/20 to-background px-4 py-4 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold tracking-tight text-foreground">
          How was your support today?
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {locked
            ? "Your rating is saved and cannot be changed."
            : "Rate your experience from 1–5 stars. You can only submit once."}
        </p>

        <div
          className="mt-3 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={locked ? "Your star rating (submitted)" : "Star rating"}
        >
          {[1, 2, 3, 4, 5].map((s) => {
            const active = s <= highlightStars;
            const StarEl = (
              <Star
                className={cn("size-9 sm:size-10", active && "fill-current")}
                strokeWidth={active ? 0 : 1.75}
              />
            );
            if (locked) {
              return (
                <span
                  key={s}
                  className={cn(
                    "rounded-xl p-1.5",
                    active ? "text-primary" : "text-muted-foreground/45"
                  )}
                  aria-hidden={!active}
                >
                  {StarEl}
                </span>
              );
            }
            return (
              <button
                key={s}
                type="button"
                onClick={() => setDraftStars(s)}
                className={cn(
                  "rounded-xl p-1.5 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active ? "text-primary" : "text-muted-foreground/45"
                )}
                aria-label={`${s} star${s > 1 ? "s" : ""}`}
                aria-pressed={active}
              >
                {StarEl}
              </button>
            );
          })}
        </div>

        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional feedback for the team…"
          maxLength={500}
          rows={2}
          readOnly={locked}
          className="mt-3 min-h-[72px] resize-y rounded-xl border-border/60 bg-background/80 text-sm"
          disabled={mutation.isPending || locked}
        />

        {!locked ? (
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Saving…" : "Submit rating"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
