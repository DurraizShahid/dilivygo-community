"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { GeoPolygon } from "@dilivygo/types";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";

const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278];
const DEFAULT_ZOOM = 13;

/** Leaflet Polygon getLatLngs() may be LatLng[] or nested LatLng[][]. */
function polygonRingToLngLatRing(latlngsNested: unknown): [number, number][] {
  if (!latlngsNested || !Array.isArray(latlngsNested) || latlngsNested.length === 0) {
    return [];
  }
  const first = latlngsNested[0] as unknown;
  if (
    first &&
    typeof first === "object" &&
    "lat" in first &&
    typeof (first as L.LatLng).lat === "number"
  ) {
    return (latlngsNested as L.LatLng[]).map((ll) => [ll.lng, ll.lat]);
  }
  return polygonRingToLngLatRing(first);
}

interface GeofenceDrawerMapProps {
  lat?: number | null;
  lon?: number | null;
  geofence?: GeoPolygon | null;
  onLocationChange?: (lat: number, lon: number) => void;
  onGeofenceChange?: (geofence: GeoPolygon | null) => void;
  height?: string;
  tileUrl?: string;
  tileAttribution?: string;
  defaultZoom?: number;
  showZoomControl?: boolean;
  showAttribution?: boolean;
  polygonStrokeColor?: string;
}

export default function GeofenceDrawerMap({
  lat,
  lon,
  geofence,
  onLocationChange,
  onGeofenceChange,
  height = "400px",
  tileUrl,
  tileAttribution,
  defaultZoom,
  showZoomControl = true,
  showAttribution = true,
  polygonStrokeColor = "#6366f1",
}: GeofenceDrawerMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const onLocationChangeRef = useRef(onLocationChange);
  const onGeofenceChangeRef = useRef(onGeofenceChange);
  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    onGeofenceChangeRef.current = onGeofenceChange;
  }, [onGeofenceChange]);

  const initMap = useCallback(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = lat && lon ? [lat, lon] : DEFAULT_CENTER;
    const initialZoom = defaultZoom ?? DEFAULT_ZOOM;
    const map = L.map(containerRef.current, {
      zoomControl: showZoomControl,
      attributionControl: showAttribution,
    }).setView(center, initialZoom);

    L.tileLayer(tileUrl || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        showAttribution === false
          ? ""
          : (tileAttribution ??
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'),
      maxZoom: 19,
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    if (lat && lon) {
      const marker = L.marker([lat, lon], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onLocationChangeRef.current?.(pos.lat, pos.lng);
      });
      markerRef.current = marker;
    }

    const geofenceRing = geofence?.coordinates?.[0];
    if (geofenceRing && geofenceRing.length > 2) {
      const latlngs = geofenceRing.map(
        (coord) => [coord[1], coord[0]] as [number, number]
      );
      const polygon = L.polygon(latlngs, {
        color: polygonStrokeColor,
        fillColor: polygonStrokeColor,
        fillOpacity: 0.15,
        weight: 2,
      });
      drawnItems.addLayer(polygon);
    }

    const drawControl = new (L.Control as any).Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: {
            color: polygonStrokeColor,
            fillColor: polygonStrokeColor,
            fillOpacity: 0.15,
            weight: 2,
          },
        },
        polyline: false,
        circle: false,
        circlemarker: false,
        rectangle: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);

    /** When Leaflet Draw is capturing clicks, do not also move the shop pin. */
    let drawInteractionActive = false;
    const setDrawActive = (active: boolean) => {
      drawInteractionActive = active;
    };
    map.on(L.Draw.Event.DRAWSTART, () => setDrawActive(true));
    map.on(L.Draw.Event.DRAWSTOP, () => setDrawActive(false));
    map.on(L.Draw.Event.EDITSTART, () => setDrawActive(true));
    map.on(L.Draw.Event.EDITSTOP, () => setDrawActive(false));

    map.on(L.Draw.Event.CREATED, (e: any) => {
      setDrawActive(false);
      drawnItems.clearLayers();
      const layer = e.layer;
      drawnItems.addLayer(layer);
      const ring = polygonRingToLngLatRing(layer.getLatLngs());
      if (ring.length < 3) return;
      const coords = [...ring, ring[0]];
      onGeofenceChangeRef.current?.({ type: "Polygon", coordinates: [coords] });
    });

    map.on(L.Draw.Event.EDITED, () => {
      const layers = drawnItems.getLayers();
      if (layers.length === 0) {
        onGeofenceChangeRef.current?.(null);
        return;
      }
      const layer = layers[0] as L.Polygon;
      const ring = polygonRingToLngLatRing(layer.getLatLngs());
      if (ring.length < 3) return;
      const coords = [...ring, ring[0]];
      onGeofenceChangeRef.current?.({ type: "Polygon", coordinates: [coords] });
    });

    map.on(L.Draw.Event.DELETED, () => {
      setDrawActive(false);
      onGeofenceChangeRef.current?.(null);
    });

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (drawInteractionActive) return;
      const { lat: clickLat, lng: clickLng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([clickLat, clickLng]);
      } else {
        const marker = L.marker([clickLat, clickLng], {
          draggable: true,
        }).addTo(map);
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          onLocationChangeRef.current?.(pos.lat, pos.lng);
        });
        markerRef.current = marker;
      }
      onLocationChangeRef.current?.(clickLat, clickLng);
    });

    if (navigator.geolocation && (lat == null || lon == null) && !geofenceRing?.length) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (mapRef.current !== map) return;
          if (!map.getContainer()?.isConnected) return;
          map.setView([pos.coords.latitude, pos.coords.longitude], initialZoom);
        },
        () => {}
      );
    }

    mapRef.current = map;
    drawnItemsRef.current = drawnItems;
    setReady(true);
  }, [
    lat,
    lon,
    geofence,
    tileUrl,
    tileAttribution,
    defaultZoom,
    showZoomControl,
    showAttribution,
    polygonStrokeColor,
  ]);

  useEffect(() => {
    const fixIcons = () => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
    };
    fixIcons();
    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        drawnItemsRef.current = null;
      }
    };
  }, [initMap]);

  return (
    <div className="rounded-xl overflow-hidden border border-border/60">
      <div ref={containerRef} style={{ height, width: "100%" }} />
      {!ready && (
        <div
          className="flex items-center justify-center bg-muted text-muted-foreground text-sm"
          style={{ height }}
        >
          Loading map...
        </div>
      )}
    </div>
  );
}
