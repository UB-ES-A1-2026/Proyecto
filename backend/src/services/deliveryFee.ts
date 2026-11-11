// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Tarifa del rider por tramos (US-05.01, #281). Es el único sitio con los importes.
import { routeDistanceKm } from './neighborhoods.js';

// Hasta `maxKm` (incluido) se cobra `fee`; el último tramo no tiene límite.
const FEE_TIERS: readonly { maxKm: number; fee: string }[] = [
  { maxKm: 2, fee: '3.00' },
  { maxKm: 5, fee: '5.00' },
  { maxKm: Infinity, fee: '7.00' },
];

// Tramo más caro: se usa cuando no se puede calcular la distancia.
const HIGHEST_FEE = '7.00';

// Importe como texto con 2 decimales, como el resto de importes de la API.
export function riderFeeForDistance(distanceKm: number): string {
  const tier = FEE_TIERS.find(({ maxKm }) => distanceKm <= maxKm);
  return tier?.fee ?? HIGHEST_FEE;
}

export interface RiderQuote {
  // null si no se puede calcular (el barrio del objeto no está en la lista).
  distanceKm: number | null;
  fee: string;
}

// Distancia por calle entre el barrio del objeto y el de entrega, y su tarifa. Si el barrio del
// objeto no está en la lista (objetos antiguos con el barrio escrito a mano) no hay distancia: se
// aplica el tramo más alto y la distancia sale null para no inventarla.
export function quoteRiderFee(
  itemNeighborhood: string,
  deliveryNeighborhood: string,
): RiderQuote {
  const distance = routeDistanceKm(itemNeighborhood, deliveryNeighborhood);

  if (distance === undefined) {
    return { distanceKm: null, fee: HIGHEST_FEE };
  }

  return {
    distanceKm: Math.round(distance * 10) / 10,
    fee: riderFeeForDistance(distance),
  };
}
