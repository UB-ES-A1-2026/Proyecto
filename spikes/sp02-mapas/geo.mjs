// Generado con asistencia de IA (Claude) – revisado por <Francesc>, <31/10/2026>
// Funciones de geometría del spike SP-02 (#91). Sin dependencias: se pueden copiar tal cual
// a un service del backend (p. ej. backend/src/services/geoService.ts) cuando se implemente.

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Distancia en línea recta (fórmula de Haversine) entre dos puntos { lat, lng }, en km.
 * Error < 0,5 % frente a la distancia geodésica exacta: de sobra para una tarifa o un filtro.
 */
export function distanceKm(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Tamaño de la celda de la ubicación aproximada: 0,005° ≈ 555 m de norte a sur y
// ≈ 420 m de este a oeste en Barcelona (41,4° N).
export const APPROXIMATE_CELL_DEGREES = 0.005;

/**
 * Ubicación aproximada que se puede enseñar a cualquiera: el centro de la celda de la cuadrícula
 * en la que cae el punto. Todos los objetos de la misma celda dan el mismo punto, así que no se
 * puede deducir el portal del propietario (a diferencia de sumar ruido aleatorio, que se
 * «promedia» si se pide varias veces).
 */
export function approximateLocation({ lat, lng }, cell = APPROXIMATE_CELL_DEGREES) {
  const snap = (value) => (Math.floor(value / cell) + 0.5) * cell;
  return {
    lat: Number(snap(lat).toFixed(6)),
    lng: Number(snap(lng).toFixed(6)),
  };
}

/**
 * Caja (lat/lng mínimos y máximos) que contiene el círculo de radio `radiusKm` alrededor de
 * `center`. Sirve para prefiltrar en SQL con un índice antes de calcular la distancia exacta.
 */
export function boundingBox(center, radiusKm) {
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const dLng = dLat / Math.cos(toRadians(center.lat));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

// Por calle se recorre más que en línea recta. Valor medido con el prototipo en Barcelona
// (ver README): se usa para estimar la distancia real sin llamar a un servicio de rutas.
export const ROAD_FACTOR = 1.3;

/**
 * Tarifa del rider de EJEMPLO (los importes los tiene que decidir el equipo en US-05.01, #66):
 * base + precio por km sobre la distancia estimada por calle, redondeada a céntimos.
 */
export function riderFee(straightKm, { base = 2, perKm = 0.8, roadFactor = ROAD_FACTOR } = {}) {
  const roadKm = straightKm * roadFactor;
  return Math.round((base + perKm * roadKm) * 100) / 100;
}
