import type { MapSettings } from "@dilivygo/types";

export { latitudeDeltaFromMapDefaultZoom } from "@dilivygo/types";

export const TILE_PRESETS: Record<
  string,
  { label: string; url: string; attribution: string; dark?: boolean }
> = {
  osm: {
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  carto_positron: {
    label: "CartoDB Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  carto_dark: {
    label: "CartoDB Dark Matter",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    dark: true,
  },
  carto_voyager: {
    label: "CartoDB Voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  stadia_smooth: {
    label: "Stadia Smooth",
    url: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://stadiamaps.com/">Stadia</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; OSM',
  },
  stadia_dark: {
    label: "Stadia Dark",
    url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://stadiamaps.com/">Stadia</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; OSM',
    dark: true,
  },
  stadia_bright: {
    label: "Stadia OSM Bright",
    url: "https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://stadiamaps.com/">Stadia</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; OSM',
  },
};

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  tilePreset: "osm",
  riderMarkerColor: "#2563EB",
  shopMarkerColor: "#F59E0B",
  customerMarkerColor: "#10B981",
  showZoomControls: true,
  showAttribution: true,
  defaultZoom: 14,
};

export function resolveTileUrl(
  settings?: MapSettings | null,
  isDark?: boolean,
): string {
  if (!settings) return TILE_PRESETS.osm.url;

  if (isDark) {
    if (settings.darkTilePreset === "custom" && settings.customDarkTileUrl) {
      return settings.customDarkTileUrl;
    }
    if (settings.darkTilePreset && TILE_PRESETS[settings.darkTilePreset]) {
      return TILE_PRESETS[settings.darkTilePreset].url;
    }
  }

  if (settings.tilePreset === "custom" && settings.customTileUrl) {
    return settings.customTileUrl;
  }
  return TILE_PRESETS[settings.tilePreset]?.url ?? TILE_PRESETS.osm.url;
}

export function resolveAttribution(
  settings?: MapSettings | null,
  isDark?: boolean,
): string {
  if (!settings) return TILE_PRESETS.osm.attribution;

  if (isDark && settings.darkTilePreset && settings.darkTilePreset !== "custom") {
    return TILE_PRESETS[settings.darkTilePreset]?.attribution ?? TILE_PRESETS.osm.attribution;
  }

  if (settings.tilePreset === "custom") return "";
  return TILE_PRESETS[settings.tilePreset]?.attribution ?? TILE_PRESETS.osm.attribution;
}
