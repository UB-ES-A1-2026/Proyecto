// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Barrios de Barcelona (US-05.01, #281): el barrio de un objeto o de una entrega se elige de esta
// lista fija en lugar de escribirlo. Con el centro de cada barrio se calcula la distancia entre el
// objeto y el destino sin geocodificar ninguna dirección (ADR 0005 y decisiones de #66).

export interface Coordinates {
  lat: number;
  lng: number;
}

// Los centros son aproximados (no son los centroides oficiales): basta con que la distancia entre
// dos barrios sea razonable para elegir un tramo de la tarifa del rider.
const NEIGHBORHOOD_CENTRES: Readonly<Record<string, Coordinates>> = {
  // Ciutat Vella
  'El Raval': { lat: 41.379, lng: 2.169 },
  'El Gòtic': { lat: 41.3825, lng: 2.177 },
  'La Barceloneta': { lat: 41.38, lng: 2.19 },
  'Sant Pere, Santa Caterina i la Ribera': { lat: 41.3875, lng: 2.179 },
  // Eixample
  "L'Antiga Esquerra de l'Eixample": { lat: 41.388, lng: 2.152 },
  "La Dreta de l'Eixample": { lat: 41.395, lng: 2.165 },
  "La Nova Esquerra de l'Eixample": { lat: 41.3815, lng: 2.148 },
  'Sagrada Família': { lat: 41.404, lng: 2.175 },
  'Sant Antoni': { lat: 41.379, lng: 2.163 },
  'El Fort Pienc': { lat: 41.395, lng: 2.183 },
  // Sants-Montjuïc
  Sants: { lat: 41.375, lng: 2.135 },
  Hostafrancs: { lat: 41.3743, lng: 2.1451 },
  'La Bordeta': { lat: 41.369, lng: 2.136 },
  'Poble-sec': { lat: 41.374, lng: 2.164 },
  // Les Corts
  'Les Corts': { lat: 41.388, lng: 2.124 },
  Pedralbes: { lat: 41.391, lng: 2.113 },
  'La Maternitat i Sant Ramon': { lat: 41.38, lng: 2.123 },
  // Sarrià-Sant Gervasi
  Sarrià: { lat: 41.401, lng: 2.122 },
  'Sant Gervasi - La Bonanova': { lat: 41.406, lng: 2.135 },
  'Sant Gervasi - Galvany': { lat: 41.398, lng: 2.148 },
  'El Putxet i el Farró': { lat: 41.405, lng: 2.145 },
  // Gràcia
  Gràcia: { lat: 41.401, lng: 2.157 },
  'La Salut': { lat: 41.413, lng: 2.158 },
  'El Coll': { lat: 41.413, lng: 2.15 },
  // Horta-Guinardó
  'El Guinardó': { lat: 41.415, lng: 2.175 },
  'El Carmel': { lat: 41.419, lng: 2.155 },
  Horta: { lat: 41.431, lng: 2.162 },
  // Nou Barris
  'Les Roquetes': { lat: 41.444, lng: 2.177 },
  Verdun: { lat: 41.438, lng: 2.176 },
  'Vilapicina i la Torre Llobeta': { lat: 41.432, lng: 2.183 },
  // Sant Andreu
  'Sant Andreu': { lat: 41.435, lng: 2.19 },
  'La Sagrera': { lat: 41.422, lng: 2.19 },
  'Bon Pastor': { lat: 41.438, lng: 2.2 },
  // Sant Martí
  Poblenou: { lat: 41.4, lng: 2.2 },
  'El Clot': { lat: 41.41, lng: 2.188 },
  'Sant Martí de Provençals': { lat: 41.417, lng: 2.2 },
  'La Verneda i la Pau': { lat: 41.422, lng: 2.21 },
  'Diagonal Mar i el Front Marítim del Poblenou': { lat: 41.411, lng: 2.216 },
};

const EARTH_RADIUS_KM = 6371;

// Por calle se recorre más que en línea recta: factor medido en Barcelona (ADR 0005).
export const ROAD_FACTOR = 1.3;

// Orden alfabético en español (ignora tildes y mayúsculas).
const SPANISH_COLLATOR = new Intl.Collator('es');

const SORTED_NEIGHBORHOODS: readonly string[] = Object.keys(
  NEIGHBORHOOD_CENTRES,
).sort((a, b) => SPANISH_COLLATOR.compare(a, b));

export function listNeighborhoods(): string[] {
  return [...SORTED_NEIGHBORHOODS];
}

export function isKnownNeighborhood(name: string): boolean {
  return Object.hasOwn(NEIGHBORHOOD_CENTRES, name);
}

// Centro aproximado del barrio, o undefined si no está en la lista (por ejemplo, objetos
// antiguos con el barrio escrito a mano).
export function neighborhoodCentre(name: string): Coordinates | undefined {
  return Object.hasOwn(NEIGHBORHOOD_CENTRES, name)
    ? NEIGHBORHOOD_CENTRES[name]
    : undefined;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

// Distancia en línea recta (Haversine) entre dos puntos, en km. Portado de
// spikes/sp02-mapas/geo.mjs (SP-02, ADR 0005).
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Distancia estimada por calle entre los centros de dos barrios (línea recta × 1,3), o undefined
// si alguno no está en la lista.
export function routeDistanceKm(
  fromNeighborhood: string,
  toNeighborhood: string,
): number | undefined {
  const from = neighborhoodCentre(fromNeighborhood);
  const to = neighborhoodCentre(toNeighborhood);
  return from && to ? distanceKm(from, to) * ROAD_FACTOR : undefined;
}
