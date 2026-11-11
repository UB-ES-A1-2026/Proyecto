// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Qué ve cada persona de la entrega de una reserva (US-05.01, #281). Función pura: las reglas de
// privacidad de las direcciones están todas aquí, para poder probarlas una a una.
import type { DeliveryMode, ReservationStatus } from '@prisma/client';

// Quién pide la reserva: el arrendatario (quien la solicita) o el propietario del objeto.
export type DeliveryViewer = 'renter' | 'owner';

export interface PickupPointView {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
}

export interface DeliveryView {
  mode: DeliveryMode;
  // 'asap' («Lo antes posible») o «HH:MM-HH:MM»; null si no es por rider.
  slot: string | null;
  pickupPoint: PickupPointView | null;
  // Tarifa del rider; null si no es por rider.
  fee: string | null;
  deliveryNeighborhood: string | null;
  // Solo en la vista del arrendatario: el propietario nunca la recibe.
  deliveryAddress: string | null;
  // Solo para el arrendatario, con recogida en casa y la solicitud aceptada o más avanzada.
  ownerAddress: string | null;
}

export interface DeliveryViewInput {
  mode: DeliveryMode | null;
  status: ReservationStatus;
  viewer: DeliveryViewer;
  slot: string | null;
  pickupPoint: PickupPointView | null;
  fee: string | null;
  deliveryNeighborhood: string | null;
  deliveryAddress: string | null;
  ownerAddress: string | null;
}

// Estados en los que el arrendatario ya puede ver la dirección del propietario.
const OWNER_ADDRESS_VISIBLE_STATUSES: readonly ReservationStatus[] = [
  'accepted',
  'paid',
  'in_progress',
  'finished',
];

// null para las reservas anteriores a US-05.01, que no tienen modo de entrega.
export function buildDeliveryView(
  input: DeliveryViewInput,
): DeliveryView | null {
  const { mode, viewer } = input;

  if (mode === null) {
    return null;
  }

  const isRider = mode === 'rider';
  const showsOwnerAddress =
    viewer === 'renter' &&
    mode === 'home' &&
    OWNER_ADDRESS_VISIBLE_STATUSES.includes(input.status);

  return {
    mode,
    slot: isRider ? (input.slot ?? 'asap') : null,
    pickupPoint: mode === 'pickup_point' ? input.pickupPoint : null,
    fee: isRider ? input.fee : null,
    deliveryNeighborhood: isRider ? input.deliveryNeighborhood : null,
    deliveryAddress:
      isRider && viewer === 'renter' ? input.deliveryAddress : null,
    ownerAddress: showsOwnerAddress ? input.ownerAddress : null,
  };
}
