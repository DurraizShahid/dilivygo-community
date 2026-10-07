'use strict';

/**
 * Decode Google Encoded Polyline Algorithm Format → [{ lat, lon }, ...]
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function decodeGooglePolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ lat: lat / 1e5, lon: lng / 1e5 });
  }
  return coordinates;
}

async function fetchGoogleDirections(fromLat, fromLon, toLat, toLon, mapsApiKey) {
  if (!mapsApiKey) return null;
  const origin = `${fromLat},${fromLon}`;
  const destination = `${toLat},${toLon}`;
  const url =
    `https://maps.googleapis.com/maps/api/directions/json?` +
    `origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}` +
    `&mode=driving&key=${encodeURIComponent(mapsApiKey)}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.status !== 'OK' || !data.routes?.[0]?.overview_polyline?.points) {
    return null;
  }
  return decodeGooglePolyline(data.routes[0].overview_polyline.points);
}

async function fetchOsrmBike(fromLat, fromLon, toLat, toLon) {
  const url =
    `https://router.project-osrm.org/route/v1/bike/${fromLon},${fromLat};${toLon},${toLat}` +
    '?overview=full&geometries=geojson';
  const response = await fetch(url, { headers: { 'User-Agent': 'DilivygoBackend/1.0' } });
  if (!response.ok) return null;
  const data = await response.json();
  const coords = data.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return coords.map(([lon, lat]) => ({ lat, lon }));
}

/**
 * Driving/biking-style path between two points for customer live tracking.
 * Prefers Google Directions when a key is configured; falls back to public OSRM.
 */
async function getPublicRouteDirections(fromLat, fromLon, toLat, toLon, mapsApiKey) {
  const google = await fetchGoogleDirections(fromLat, fromLon, toLat, toLon, mapsApiKey);
  if (google?.length >= 2) return { coordinates: google, source: 'google' };

  const osrm = await fetchOsrmBike(fromLat, fromLon, toLat, toLon);
  if (osrm?.length >= 2) return { coordinates: osrm, source: 'osrm' };

  return null;
}

module.exports = {
  decodeGooglePolyline,
  getPublicRouteDirections,
};
