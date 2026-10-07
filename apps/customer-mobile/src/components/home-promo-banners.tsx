import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  useWindowDimensions,
  type ImageStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@dilivygo/i18n";
import {
  getPlatformBannerSlideUrls,
  getPlatformBannerAspectStyle,
  type PlatformBanner,
  type PlatformBannerImageResize,
  type PlatformBannerPlacement,
} from "@dilivygo/types";
import { api } from "@/lib/api";
import { defaultWorkspaceRef } from "@/lib/workspace-ref";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import type { AppColors } from "@/lib/theme";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import { bannerGradientColors } from "@/lib/platform-banner-gradient";

function bannerImageResizeMode(
  mode: PlatformBannerImageResize | undefined,
): ImageStyle["resizeMode"] {
  switch (mode) {
    case "fit":
      return "contain";
    case "stretch":
      return "stretch";
    case "tile":
    case "span":
    case "center":
    default:
      return "cover";
  }
}

function aspectRatioFromPreset(
  preset: PlatformBanner["imageAspectPreset"],
): number | undefined {
  const { aspectRatio } = getPlatformBannerAspectStyle(preset);
  if (!aspectRatio) return undefined;
  const parts = aspectRatio.split("/").map((x) => Number(x.trim()));
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  return parts[0]! / parts[1]!;
}

function createCardStyles(c: AppColors) {
  return StyleSheet.create({
    card: {
      borderRadius: borderRadius.xl,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}12`,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 3,
    },
    cardInner: {
      justifyContent: "space-between",
      padding: spacing.lg,
      minHeight: 160,
    },
    imageLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    imageDim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.38)",
    },
    textBlock: {
      zIndex: 2,
    },
    title: {
      fontSize: fontSize.lg,
      fontWeight: "800",
      lineHeight: 24,
    },
    subtitle: {
      fontSize: fontSize.sm,
      marginTop: 4,
      opacity: 0.88,
    },
    ctaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: spacing.md,
    },
    ctaText: {
      fontSize: fontSize.sm,
      fontWeight: "700",
    },
    carouselBtn: {
      position: "absolute",
      top: "50%",
      marginTop: -18,
      zIndex: 10,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.92)",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 4,
    },
    carouselBtnLeft: { left: spacing.sm },
    carouselBtnRight: { right: spacing.sm },
    dots: {
      position: "absolute",
      bottom: spacing.sm,
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
      backgroundColor: "rgba(255,255,255,0.45)",
    },
    dotActive: {
      backgroundColor: "#fff",
    },
  });
}

function createStripStyles(c: AppColors) {
  return StyleSheet.create({
    section: {
      marginTop: spacing.md,
    },
    sectionTight: {
      marginTop: spacing.sm,
    },
    heading: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      marginBottom: spacing.md,
      paddingHorizontal: spacing.xl,
    },
    headingPrimary: {
      fontSize: fontSize.lg,
      fontWeight: "800",
      color: c.primary,
      letterSpacing: -0.3,
    },
    headingRest: {
      fontSize: fontSize.lg,
      fontWeight: "800",
      color: c.foreground,
      letterSpacing: -0.3,
    },
    scrollContent: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xs,
      gap: spacing.md,
      flexDirection: "row",
    },
  });
}

function PromoBannerCard({
  banner,
  cardWidth,
  primaryHex,
}: {
  banner: PlatformBanner;
  cardWidth: number;
  primaryHex: string;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createCardStyles);
  const slides = getPlatformBannerSlideUrls(banner);
  const hasImage = slides.length > 0;
  const useCarousel = Boolean(banner.carouselEnabled && slides.length > 1);
  const [idx, setIdx] = useState(0);
  const ar = aspectRatioFromPreset(banner.imageAspectPreset);
  const resizeMode = bannerImageResizeMode(banner.imageResize);
  const [from, to] = bannerGradientColors(banner.bgGradient, primaryHex);

  useEffect(() => {
    setIdx(0);
  }, [banner.id, slides.join("|")]);

  useEffect(() => {
    if (!useCarousel) return;
    const timer = setInterval(
      () => setIdx((i) => (i + 1) % slides.length),
      5500,
    );
    return () => clearInterval(timer);
  }, [useCarousel, slides.length, banner.id]);

  const openCta = useCallback(() => {
    const url = banner.ctaLink?.trim();
    if (!url) return;
    void Linking.openURL(url);
  }, [banner.ctaLink]);

  const cta = banner.ctaLink?.trim();

  const cardBody = (
    <View
      style={[
        styles.cardInner,
        ar != null ? { aspectRatio: ar } : { minHeight: 176 },
      ]}
    >
      {!hasImage ? (
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <>
          {slides.map((url, i) => (
            <Image
              key={`${banner.id}-${url}-${i}`}
              source={{ uri: url }}
              style={[styles.imageLayer, { opacity: i === idx ? 1 : 0 }]}
              resizeMode={resizeMode}
            />
          ))}
          <View style={styles.imageDim} pointerEvents="none" />
        </>
      )}

      {useCarousel ? (
        <>
          <TouchableOpacity
            style={[styles.carouselBtn, styles.carouselBtnLeft]}
            onPress={() =>
              setIdx((i) => (i - 1 + slides.length) % slides.length)
            }
            accessibilityLabel="Previous slide"
          >
            <Ionicons name="chevron-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.carouselBtn, styles.carouselBtnRight]}
            onPress={() => setIdx((i) => (i + 1) % slides.length)}
            accessibilityLabel="Next slide"
          >
            <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.dots} pointerEvents="none">
            {slides.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === idx ? styles.dotActive : null]}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.textBlock} pointerEvents="none">
        <Text style={[styles.title, { color: banner.textColor }]}>
          {banner.title}
        </Text>
        {banner.subtitle ? (
          <Text
            style={[styles.subtitle, { color: banner.textColor }]}
            numberOfLines={3}
          >
            {banner.subtitle}
          </Text>
        ) : null}
        {banner.ctaText ? (
          <View style={styles.ctaRow}>
            <Text style={[styles.ctaText, { color: banner.textColor }]}>
              {banner.ctaText}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={banner.textColor}
            />
          </View>
        ) : null}
      </View>
    </View>
  );

  return cta ? (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth }]}
      onPress={openCta}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel={banner.ctaText || banner.title}
    >
      {cardBody}
    </TouchableOpacity>
  ) : (
    <View style={[styles.card, { width: cardWidth }]}>{cardBody}</View>
  );
}

export function HomePromoBannerStrip({
  placement,
  showPromotionsHeading = false,
  /** When the parent already applies horizontal padding (e.g. FlatList content). */
  omitOuterGutter = false,
}: {
  placement: PlatformBannerPlacement;
  showPromotionsHeading?: boolean;
  omitOuterGutter?: boolean;
}) {
  const { width } = useWindowDimensions();
  const { t } = useTranslation("mobile");
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStripStyles);

  const projectRef = defaultWorkspaceRef();
  const { data } = useQuery<{ banners: PlatformBanner[] }>({
    queryKey: ["public-banners", placement, projectRef],
    queryFn: () => api.public.banners(placement, projectRef),
    staleTime: 5 * 60 * 1000,
  });

  const banners = data?.banners ?? [];
  if (banners.length === 0) return null;

  const cardWidth = Math.min(320, width - spacing.xl * 2);

  return (
    <View
      style={showPromotionsHeading ? styles.section : styles.sectionTight}
    >
      {showPromotionsHeading ? (
        <View
          style={[styles.heading, omitOuterGutter && { paddingHorizontal: 0 }]}
        >
          <Text style={styles.headingPrimary}>
            {t("home.promotionsHighlight")}
          </Text>
          <Text style={styles.headingRest}>
            {" "}
            {t("home.promotionsRest")}
          </Text>
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          omitOuterGutter && { paddingHorizontal: 0 },
        ]}
        decelerationRate="fast"
      >
        {banners.map((b) => (
          <PromoBannerCard
            key={b.id}
            banner={b}
            cardWidth={cardWidth}
            primaryHex={colors.primary}
          />
        ))}
      </ScrollView>
    </View>
  );
}
