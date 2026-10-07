"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MapSettings } from "@dilivygo/types";
import {
  useMapSettings,
  resolveTileUrl,
  resolveAttribution,
  DEFAULT_MAP_SETTINGS,
} from "@dilivygo/ui";
import { api } from "@/lib/api";

interface RiderLocation {
  lat: number;
  lon: number;
  heading?: number | null;
  speed?: number | null;
}

interface Props {
  riderLocation: RiderLocation | null;
  shopLocation?: { lat: number; lon: number } | null;
  customerLocation?: { lat: number; lon: number } | null;
}

function makeDivIcon(color: string, size: number, svgPath: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:3px solid hsl(var(--background));
      box-shadow:0 2px 8px hsl(var(--foreground)/0.25);
      display:flex;align-items:center;justify-content:center;
      color:hsl(var(--primary-foreground));
    ">${svgPath}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const BIKE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;
const SHOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2l1 5h16l1-5"/><path d="M3 7v2a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4V7"/><path d="M5 21V11"/><path d="M19 21V11"/><path d="M5 21h14"/></svg>`;
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

function FitBounds({
  riderLocation,
  shopLocation,
  customerLocation,
  routePositions,
}: Props & {
  routePositions: [number, number][] | null;
}) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];
    if (routePositions && routePositions.length >= 2) {
      for (const p of routePositions) points.push(p);
    } else {
      if (riderLocation) points.push([riderLocation.lat, riderLocation.lon]);
      if (shopLocation) points.push([shopLocation.lat, shopLocation.lon]);
      if (customerLocation)
        points.push([customerLocation.lat, customerLocation.lon]);
    }
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
  }, [map, riderLocation, shopLocation, customerLocation, routePositions]);

  return null;
}

function AnimatedRiderMarker({
  location,
  icon,
}: {
  location: RiderLocation;
  icon: L.DivIcon;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const prevPos = useRef<[number, number] | null>(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const newPos: [number, number] = [location.lat, location.lon];
    if (prevPos.current) {
      marker.setLatLng(newPos);
    }
    prevPos.current = newPos;
  }, [location.lat, location.lon]);

  const eventHandlers = useMemo(
    () => ({
      add: (e: L.LeafletEvent) => {
        markerRef.current = e.target;
      },
    }),
    [],
  );

  return (
    <Marker
      position={[location.lat, location.lon]}
      icon={icon}
      eventHandlers={eventHandlers}
    >
      <Popup>
        <span className="text-xs font-medium">
          Your rider is on the way!
          {typeof location.speed === "number" && location.speed > 0 && (
            <> &middot; {Math.round(location.speed * 3.6)} km/h</>
          )}
        </span>
      </Popup>
    </Marker>
  );
}

/** ~110 m grid so the road route is not refetched on every GPS tick */
function riderBucket(rl: RiderLocation | null): string {
  if (!rl) return "";
  return `${rl.lat.toFixed(3)},${rl.lon.toFixed(3)}`;
}

export default function RiderTrackingMap({
  riderLocation,
  shopLocation,
  customerLocation,
}: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const ms = useMapSettings();
  const s: MapSettings = { ...DEFAULT_MAP_SETTINGS, ...ms };

  const [routePositions, setRoutePositions] = useState<[number, number][] | null>(
    null,
  );
  const [routeApproximate, setRouteApproximate] = useState(false);
  const rb = riderBucket(riderLocation);

  useEffect(() => {
    const from = riderLocation ?? shopLocation ?? null;
    const to = customerLocation ?? null;
    if (!from || !to) {
      setRoutePositions(null);
      setRouteApproximate(false);
      return;
    }

    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const data = await api.public.routeDirections(
            from.lat,
            from.lon,
            to.lat,
            to.lon,
          );
          if (cancelled) return;
          const pts = data.coordinates.map(
            (c) => [c.lat, c.lon] as [number, number],
          );
          if (pts.length >= 2) {
            setRoutePositions(pts);
            setRouteApproximate(false);
          } else {
            setRoutePositions([
              [from.lat, from.lon],
              [to.lat, to.lon],
            ]);
            setRouteApproximate(true);
          }
        } catch {
          if (cancelled) return;
          setRoutePositions([
            [from.lat, from.lon],
            [to.lat, to.lon],
          ]);
          setRouteApproximate(true);
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    customerLocation?.lat,
    customerLocation?.lon,
    shopLocation?.lat,
    shopLocation?.lon,
    rb,
  ]);

  const tileUrl = resolveTileUrl(s, isDark);
  const tileAttribution = resolveAttribution(s, isDark);
  const riderIcon = useMemo(
    () => makeDivIcon(s.riderMarkerColor, 36, BIKE_SVG),
    [s.riderMarkerColor],
  );
  const shopIcon = useMemo(
    () => makeDivIcon(s.shopMarkerColor, 32, SHOP_SVG),
    [s.shopMarkerColor],
  );
  const customerIcon = useMemo(
    () => makeDivIcon(s.customerMarkerColor, 32, PIN_SVG),
    [s.customerMarkerColor],
  );

  const center: [number, number] = riderLocation
    ? [riderLocation.lat, riderLocation.lon]
    : shopLocation
      ? [shopLocation.lat, shopLocation.lon]
      : [51.505, -0.09];

  return (
    <div className="relative h-[280px] w-full overflow-hidden rounded-2xl border border-border/50">
      <MapContainer
        center={center}
        zoom={s.defaultZoom}
        className="h-full w-full"
        zoomControl={s.showZoomControls}
        attributionControl={s.showAttribution}
      >
        <TileLayer url={tileUrl} attribution={tileAttribution} />
        <FitBounds
          riderLocation={riderLocation}
          shopLocation={shopLocation}
          customerLocation={customerLocation}
          routePositions={routePositions}
        />

        {routePositions && routePositions.length >= 2 && (
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: s.riderMarkerColor,
              weight: 4,
              opacity: routeApproximate ? 0.55 : 0.9,
              dashArray: routeApproximate ? "10 7" : undefined,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        )}

        {riderLocation && (
          <AnimatedRiderMarker location={riderLocation} icon={riderIcon} />
        )}

        {shopLocation && (
          <Marker
            position={[shopLocation.lat, shopLocation.lon]}
            icon={shopIcon}
          >
            <Popup>Restaurant</Popup>
          </Marker>
        )}

        {customerLocation && (
          <Marker
            position={[customerLocation.lat, customerLocation.lon]}
            icon={customerIcon}
          >
            <Popup>Delivery address</Popup>
          </Marker>
        )}
      </MapContainer>

      {riderLocation && (
        <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          Live tracking
        </div>
      )}
    </div>
  );
}
