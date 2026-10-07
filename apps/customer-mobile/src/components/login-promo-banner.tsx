import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Linking,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { defaultWorkspaceRef } from "@/lib/workspace-ref";
import type { PlatformBanner, PlatformBannerPlacement } from "@dilivygo/types";
import {
  getPlatformBannerSlideUrls,
  getPlatformBannerAspectStyle,
} from "@dilivygo/types";
import { useAppTheme } from "@/providers/theme-provider";
import { fonts } from "@/lib/theme";

function aspectRatioNumber(
  preset: PlatformBanner["imageAspectPreset"]
): number | undefined {
  const s = getPlatformBannerAspectStyle(preset).aspectRatio;
  if (!s) return undefined;
  const parts = s.split("/").map((x) => parseFloat(x.trim()));
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
    return parts[0] / parts[1];
  }
  return undefined;
}

function LoginPromoCard({ banner }: { banner: PlatformBanner }) {
  const { colors } = useAppTheme();
  const slides = getPlatformBannerSlideUrls(banner);
  const useCarousel = Boolean(banner.carouselEnabled && slides.length > 1);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [banner.id, slides.join("|")]);

  useEffect(() => {
    if (!useCarousel) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5500);
    return () => clearInterval(t);
  }, [useCarousel, slides.length, banner.id]);

  const url = slides[idx];
  const ar = aspectRatioNumber(banner.imageAspectPreset);
  const cta = banner.ctaLink?.trim();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.muted },
        ar ? { aspectRatio: ar } : { minHeight: 140 },
      ]}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "rgba(0,0,0,0.35)" },
        ]}
      />
      {useCarousel && slides.length > 1 ? (
        <>
          <Pressable
            style={styles.carouselBtnLeft}
            onPress={() =>
              setIdx((i) => (i - 1 + slides.length) % slides.length)
            }
          >
            <Ionicons name="chevron-back" size={18} color="#111" />
          </Pressable>
          <Pressable
            style={styles.carouselBtnRight}
            onPress={() => setIdx((i) => (i + 1) % slides.length)}
          >
            <Ionicons name="chevron-forward" size={18} color="#111" />
          </Pressable>
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === idx ? "#fff" : "rgba(255,255,255,0.45)" },
                ]}
              />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.cardContent}>
        <View>
          <Text
            style={[styles.title, { color: banner.textColor || "#fff" }]}
            numberOfLines={2}
          >
            {banner.title}
          </Text>
          {banner.subtitle ? (
            <Text
              style={[
                styles.subtitle,
                { color: banner.textColor || "#fff", opacity: 0.85 },
              ]}
              numberOfLines={2}
            >
              {banner.subtitle}
            </Text>
          ) : null}
        </View>
        {banner.ctaText ? (
          <Pressable
            disabled={!cta}
            onPress={() => cta && Linking.openURL(cta)}
            style={({ pressed }) => [styles.ctaRow, pressed && cta && { opacity: 0.85 }]}
          >
            <Text
              style={[styles.ctaText, { color: banner.textColor || "#fff" }]}
            >
              {banner.ctaText}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={banner.textColor || "#fff"}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function LoginPromoBanner({
  placement = "login",
}: {
  placement?: PlatformBannerPlacement;
}) {
  const projectRef = defaultWorkspaceRef();
  const { data } = useQuery({
    queryKey: ["public-banners", placement, projectRef],
    queryFn: () => api.public.banners(placement, projectRef),
    staleTime: 5 * 60 * 1000,
  });

  const banners = data?.banners ?? [];
  if (banners.length === 0) return null;

  return (
    <View style={styles.section}>
      {banners.map((b) => (
        <LoginPromoCard key={b.id} banner={b} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { width: "100%", marginBottom: 20 },
  card: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 0,
  },
  cardContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 20,
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.bold,
    fontWeight: "700",
    lineHeight: 24,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  ctaText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    fontWeight: "600",
  },
  carouselBtnLeft: {
    position: "absolute",
    left: 8,
    top: "50%",
    marginTop: -18,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
  },
  carouselBtnRight: {
    position: "absolute",
    right: 8,
    top: "50%",
    marginTop: -18,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    zIndex: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
