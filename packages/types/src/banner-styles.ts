/** How the banner background image is sized relative to the card (slider = zoom 50–200%). */
export type PlatformBannerImageResize =
  | "fit"
  | "stretch"
  | "tile"
  | "center"
  | "span";

type LayerStyle = {
  backgroundSize: string;
  backgroundRepeat: string;
  backgroundPosition: string;
};

function clampPct(v: number, fallback: number) {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, v));
}

function imageLayerStyle(
  scale: number,
  mode: PlatformBannerImageResize | undefined,
  posX: number | undefined,
  posY: number | undefined,
): LayerStyle {
  const s = Math.min(200, Math.max(50, scale));
  const ratio = s / 100;
  const one = `${s}%`;
  const two = `${one} ${one}`;
  const zoomed = `calc(100% * ${ratio}) calc(100% * ${ratio})`;
  const m = mode ?? "center";
  const pos = `${clampPct(posX ?? 50, 50)}% ${clampPct(posY ?? 50, 50)}%`;

  switch (m) {
    case "fit":
      return {
        backgroundSize: `${one} auto`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: pos,
      };
    case "stretch":
      return {
        backgroundSize: two,
        backgroundRepeat: "no-repeat",
        backgroundPosition: pos,
      };
    case "tile":
      return {
        backgroundSize: two,
        backgroundRepeat: "repeat",
        backgroundPosition: pos,
      };
    case "span":
      return {
        backgroundSize: zoomed,
        backgroundRepeat: "no-repeat",
        backgroundPosition: pos,
      };
    case "center":
    default:
      return {
        backgroundSize: one,
        backgroundRepeat: "no-repeat",
        backgroundPosition: pos,
      };
  }
}

/** Gradient (cover) + image — used on customer promo cards and superadmin preview. */
export function getPlatformBannerImageBackgroundStyle(
  scale: number,
  mode: PlatformBannerImageResize | undefined,
  posX?: number,
  posY?: number,
): LayerStyle {
  const inner = imageLayerStyle(scale, mode, posX, posY);
  return {
    backgroundSize: `cover, ${inner.backgroundSize}`,
    backgroundRepeat: `no-repeat, ${inner.backgroundRepeat}`,
    backgroundPosition: `center, ${inner.backgroundPosition}`,
  };
}

/** Image URL only (no gradient overlay) — list thumbnails. */
export function getPlatformBannerImageOnlyBackgroundStyle(
  scale: number,
  mode: PlatformBannerImageResize | undefined,
  posX?: number,
  posY?: number,
): LayerStyle {
  return imageLayerStyle(scale, mode, posX, posY);
}
