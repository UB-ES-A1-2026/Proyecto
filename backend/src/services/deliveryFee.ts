// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Tarifa del rider por tramos (US-05.01, #281). Es el único sitio con los importes.
import { routeDistanceKm } from './neighborhoods.js';

// Hasta `maxKm` (incluido) se cobra `fee`; el último tramo no tiene límite. Los tramos se aplican
// a la distancia ya redondeada a 1 decimal, la que se enseña al usuario (ver quoteRiderFee).
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

// Distancia por calle entre el barrio del objeto y el de entrega, y su tarifa. El tramo se elige con
// la distancia redondeada a 1 decimal, la misma que se muestra: así «2,0 km» es siempre el tramo de
// 3 €, y no el de 5 € por un 2,04 que el usuario no ve. Si el barrio del objeto no está en la lista
// (objetos antiguos con el barrio escrito a mano) no hay distancia: se aplica el tramo más alto y la
// distancia sale null para no inventarla.
export function quoteRiderFee(
  itemNeighborhood: string,
  deliveryNeighborhood: string,
): RiderQuote {
  const distance = routeDistanceKm(itemNeighborhood, deliveryNeighborhood);

  if (distance === undefined) {
    return { distanceKm: null, fee: HIGHEST_FEE };
  }

  const shownDistance = Math.round(distance * 10) / 10;

  return {
    distanceKm: shownDistance,
    fee: riderFeeForDistance(shownDistance),
  };
}
