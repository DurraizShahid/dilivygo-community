"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import { useResolvedProjectRef } from "@/lib/resolved-project-ref";
import {
  getPlatformBannerAspectStyle,
  getPlatformBannerImageOnlyBackgroundStyle,
  getPlatformBannerSlideUrls,
  type PlatformBanner,
  type PlatformBannerPlacement,
} from "@dilivygo/types";

function PromoBannerCard({ b }: { b: PlatformBanner }) {
  const { t } = useTranslation("customer");
  const slides = getPlatformBannerSlideUrls(b);
  const useCarousel = Boolean(b.carouselEnabled && slides.length > 1);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [b.id, slides.join("|")]);

  useEffect(() => {
    if (!useCarousel) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % slides.length),
      5500
    );
    return () => clearInterval(t);
  }, [useCarousel, slides.length, b.id]);

  const aspect = getPlatformBannerAspectStyle(b.imageAspectPreset);
  const hasImage = slides.length > 0;
  const cta = b.ctaLink || undefined;
  const posX = typeof b.imagePosX === "number" ? b.imagePosX : 50;
  const posY = typeof b.imagePosY === "number" ? b.imagePosY : 50;

  return (
    <div
      className={cn(
        "group relative flex w-full min-w-[280px] flex-1 flex-col justify-between overflow-hidden rounded-2xl shadow-md ring-1 ring-border/60 sm:min-w-[300px]",
        hasImage ? "bg-muted" : `bg-gradient-to-r ${b.bgGradient}`,
        !aspect.aspectRatio && "min-h-[180px] sm:min-h-[200px]",
        cta && "cursor-pointer"
      )}
      style={aspect.aspectRatio ? aspect : undefined}
    >
      {hasImage && (
        <div className="absolute inset-0 z-0">
          {useCarousel ? (
            slides.map((url, i) => (
              <div
                key={`${url}-${i}`}
                className={cn(
                  "absolute inset-0 transition-opacity duration-500",
                  i === idx ? "opacity-100" : "opacity-0"
                )}
                style={{
                  backgroundImage: `url(${url})`,
                  ...getPlatformBannerImageOnlyBackgroundStyle(
                    b.imageScale ?? 100,
                    b.imageResize,
                    posX,
                    posY,
                  ),
                }}
              />
            ))
          ) : (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${slides[0]})`,
                ...getPlatformBannerImageOnlyBackgroundStyle(
                  b.imageScale ?? 100,
                  b.imageResize,
                  posX,
                  posY,
                ),
              }}
            />
          )}
        </div>
      )}

      {cta && (
        <a
          href={cta}
          className="absolute inset-0 z-[5]"
          aria-label={b.ctaText || b.title}
        >
          <span className="sr-only">{b.ctaText || b.title}</span>
        </a>
      )}

      {useCarousel && (
        <>
          <button
            type="button"
            className="absolute left-2 top-1/2 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background"
            aria-label={t("promo.previousSlide")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIdx((i) => (i - 1 + slides.length) % slides.length);
            }}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            className="absolute right-2 top-1/2 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background"
            aria-label={t("promo.nextSlide")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIdx((i) => (i + 1) % slides.length);
            }}
          >
            <ChevronRight className="size-4" />
          </button>
          <div
            className="pointer-events-none absolute bottom-2 left-0 right-0 z-20 flex justify-center gap-1.5"
            aria-hidden
          >
            {slides.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  i === idx ? "bg-background" : "bg-background/50"
                )}
              />
            ))}
          </div>
        </>
      )}

      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-br from-background/20 to-transparent" />

      <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col justify-between p-5 sm:p-6">
        <div>
          <h3
            className="text-lg font-bold leading-tight sm:text-xl"
            style={{ color: b.textColor }}
          >
            {b.title}
          </h3>
          {b.subtitle && (
            <p
              className="mt-1 text-sm"
              style={{ color: b.textColor, opacity: 0.8 }}
            >
              {b.subtitle}
            </p>
          )}
        </div>
        {b.ctaText && (
          <div
            className="relative mt-4 flex items-center gap-1 text-sm font-semibold"
            style={{ color: b.textColor }}
          >
            <span>{b.ctaText}</span>
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </div>
        )}
      </div>
    </div>
  );
}

export function PromoBanner({
  placement = "home_promotions",
  heading,
}: {
  placement?: PlatformBannerPlacement;
  heading?: string;
}) {
  const { t } = useTranslation("customer");
  const projectRef = useResolvedProjectRef();
  const { data } = useQuery<{ banners: PlatformBanner[] }>({
    queryKey: ["public-banners", placement, projectRef],
    queryFn: () => api.public.banners(placement, projectRef || undefined),
    staleTime: 5 * 60 * 1000,
  });

  const banners = data?.banners ?? [];

  if (banners.length === 0) return null;

  const showPromotionsHeading = placement === "home_promotions";
  const showHeading = showPromotionsHeading || Boolean(heading);

  return (
    <section
      className={
        showHeading ? "mt-8" : "my-6 first:mt-0 first:pt-0"
      }
    >
      {showPromotionsHeading && (
        <h2 className="mb-4 text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
          <span className="text-primary">{t("promo.homeHeadingHighlight")}</span>
          <span>{t("promo.homeHeadingRest")}</span>
        </h2>
      )}
      {!showPromotionsHeading && heading ? (
        <h2 className="mb-4 text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
          {heading}
        </h2>
      ) : null}
      <div
        className={cn(
          "hide-scrollbar flex gap-4 overflow-x-auto pb-2",
          showPromotionsHeading && "mt-0"
        )}
      >
        {banners.map((b) => (
          <PromoBannerCard key={b.id} b={b} />
        ))}
      </div>
    </section>
  );
}
