/** Preset IDs stored in `platform_banners.image_aspect_preset`. */
export type PlatformBannerAspectPreset =
  | "auto"
  | "21_9"
  | "16_9"
  | "3_2"
  | "4_3"
  | "1_1"
  | "4_5"
  | "9_16"
  | "og_1200_628"
  | "banner_1920_600"
  | "leaderboard_728_90"
  | "medium_300_250"
  | "skyscraper_160_600"
  | "mobile_390_844";

export type PlatformBannerAspectOption = {
  id: PlatformBannerAspectPreset;
  /** Shown in admin dropdown */
  label: string;
  /** Pixel size hint for designers */
  pixels: string;
  /** CSS aspect-ratio value (omit for auto) */
  ratio: string | null;
};

/** Common web / ad / social dimensions — labels explain typical use. */
export const PLATFORM_BANNER_ASPECT_PRESETS: PlatformBannerAspectOption[] = [
  { id: "auto", label: "Auto (natural height)", pixels: "—", ratio: null },
  { id: "16_9", label: "Hero / video (16:9)", pixels: "1920×1080", ratio: "16/9" },
  { id: "21_9", label: "Ultrawide hero (21:9)", pixels: "2560×1080", ratio: "21/9" },
  { id: "banner_1920_600", label: "Full-width strip (1920×600)", pixels: "1920×600", ratio: "1920/600" },
  { id: "3_2", label: "Photo / DSLR (3:2)", pixels: "1500×1000", ratio: "3/2" },
  { id: "4_3", label: "Tablet / classic (4:3)", pixels: "1024×768", ratio: "4/3" },
  { id: "1_1", label: "Square — Instagram post (1:1)", pixels: "1080×1080", ratio: "1/1" },
  { id: "4_5", label: "Portrait feed (4:5)", pixels: "1080×1350", ratio: "4/5" },
  { id: "9_16", label: "Stories / Reels (9:16)", pixels: "1080×1920", ratio: "9/16" },
  { id: "og_1200_628", label: "Open Graph / Facebook (1200×628)", pixels: "1200×628", ratio: "1200/628" },
  { id: "leaderboard_728_90", label: "Leaderboard IAB (728×90)", pixels: "728×90", ratio: "728/90" },
  { id: "medium_300_250", label: "Medium rectangle IAB (300×250)", pixels: "300×250", ratio: "300/250" },
  { id: "skyscraper_160_600", label: "Wide skyscraper IAB (160×600)", pixels: "160×600", ratio: "160/600" },
  { id: "mobile_390_844", label: "Mobile frame (390×844)", pixels: "390×844", ratio: "390/844" },
];

/** Ordered background image URLs for a banner (single or carousel). */
export function getPlatformBannerSlideUrls(b: {
  carouselEnabled?: boolean;
  imageUrls?: string[] | null;
  imageUrl?: string | null;
}): string[] {
  const urls = b.imageUrls?.filter((u) => u?.trim()) ?? [];
  if (b.carouselEnabled && urls.length > 0) return urls;
  if (b.imageUrl?.trim()) return [b.imageUrl.trim()];
  return [];
}

/** Inline style for fixed aspect; omit when auto. */
export function getPlatformBannerAspectStyle(
  preset: PlatformBannerAspectPreset | undefined
): { aspectRatio?: string } {
  const id = preset ?? "auto";
  if (id === "auto") return {};
  const row = PLATFORM_BANNER_ASPECT_PRESETS.find((p) => p.id === id);
  const r = row?.ratio;
  if (!r) return {};
  return { aspectRatio: r.replace("/", " / ") };
}
