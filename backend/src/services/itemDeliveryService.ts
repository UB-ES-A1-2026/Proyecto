// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Opciones de entrega de un objeto y tarifa del rider (US-05.01, #281).
import { AppError } from '../errors/appError.js';
import { findItemDeliveryInfo } from '../repositories/itemDeliveryRepository.js';
import { listPickupPoints } from '../repositories/pickupPointRepository.js';
import { quoteRiderFee, type RiderQuote } from './deliveryFee.js';
import { availableSlots } from './deliverySlots.js';
import { selectableModes } from './itemDelivery.js';
import { invalidFieldMessage } from './itemService.js';
import { todayInSpain } from './reservationService.js';
import {
  distanceKm,
  isKnownNeighborhood,
  neighborhoodCentre,
} from './neighborhoods.js';

export const ITEM_NOT_FOUND_MESSAGE = 'No hemos encontrado este objeto.';
export const NO_RIDER_MESSAGE = 'Este objeto no ofrece entrega por rider.';

export interface DeliveryOptions {
  modes: { home: boolean; rider: boolean; pickupPoint: boolean };
  pickupPoints: {
    id: string;
    name: string;
    address: string;
    neighborhood: string;
    // Desde el centro del barrio del objeto; null si ese barrio no está en la lista.
    distanceKm: number | null;
  }[];
  slots: string[];
}

// Solo los objetos publicados ofrecen entrega; para los demás, como si no existieran.
async function findPublishedItem(itemId: string) {
  const item = await findItemDeliveryInfo(itemId);

  if (!item || item.status !== 'published') {
    throw new AppError(404, ITEM_NOT_FOUND_MESSAGE);
  }

  return item;
}

// Modos que ofrece el objeto, sus puntos de recogida (del más cercano al más lejano) y las
// franjas del rider para el día de inicio.
export async function getDeliveryOptions(
  itemId: string,
  startDate: string | undefined,
  now: Date = new Date(),
): Promise<DeliveryOptions> {
  const item = await findPublishedItem(itemId);
  const itemCentre = neighborhoodCentre(item.neighborhood);

  const pickupPoints = item.pickupPointDelivery
    ? (await listPickupPoints())
        .map((point) => ({
          id: point.id,
          name: point.name,
          address: point.address,
          neighborhood: point.neighborhood,
          distanceKm: itemCentre
            ? Math.round(
                distanceKm(itemCentre, {
                  lat: point.latitude.toNumber(),
                  lng: point.longitude.toNumber(),
                }) * 10,
              ) / 10
            : null,
        }))
        .sort(
          (a, b) =>
            (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
            a.name.localeCompare(b.name, 'es'),
        )
    : [];

  return {
    modes: selectableModes(item),
    pickupPoints,
    // Sin fecha de inicio no se filtra nada.
    slots: availableSlots(startDate === todayInSpain(now), now),
  };
}

// Distancia y tarifa del rider hasta un barrio de entrega.
export async function getRiderQuote(
  itemId: string,
  deliveryNeighborhood: string,
): Promise<RiderQuote> {
  const item = await findPublishedItem(itemId);

  if (!isKnownNeighborhood(deliveryNeighborhood)) {
    throw new AppError(
      400,
      invalidFieldMessage('barrio de entrega'),
      'deliveryNeighborhood',
    );
  }

  if (!selectableModes(item).rider) {
    throw new AppError(400, NO_RIDER_MESSAGE);
  }

  return quoteRiderFee(item.neighborhood, deliveryNeighborhood);
}
