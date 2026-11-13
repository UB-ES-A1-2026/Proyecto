// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Entrega de una solicitud de alquiler (US-05.01, #282). Contrato del backend en #321.
import { apiRequest } from './apiClient';

export type DeliveryMode = 'home' | 'rider' | 'pickup_point';

// «Lo antes posible»: el valor de `slot` que entiende la API.
export const ASAP_SLOT = 'asap';

export type PickupPoint = {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
};

// Respuesta de GET /api/objetos/:id/entrega?startDate=AAAA-MM-DD.
export type DeliveryOptions = {
  modes: { home: boolean; rider: boolean; pickupPoint: boolean };
  // Ya ordenados del más cercano al más lejano; distanceKm es null si no se puede calcular.
  pickupPoints: (PickupPoint & { distanceKm: number | null })[];
  // Franjas «HH:MM-HH:MM» del día de inicio (si es hoy, sin las que ya han empezado).
  slots: string[];
};

// Respuesta de GET /api/objetos/:id/entrega/tarifa?barrio=<nombre>. fee llega como texto («5.00»).
export type RiderQuote = { distanceKm: number | null; fee: string };

// `delivery` de una solicitud, tal como la ve quien la pide (reglas de privacidad del backend:
// deliveryAddress solo le llega al arrendatario; ownerAddress, solo con recogida en casa y la
// solicitud aceptada o más avanzada). Es null en las solicitudes anteriores a US-05.01.
export type ReservationDelivery = {
  mode: DeliveryMode;
  slot: string | null;
  pickupPoint: PickupPoint | null;
  fee: string | null;
  deliveryNeighborhood: string | null;
  deliveryAddress: string | null;
  ownerAddress: string | null;
};

// Campos de entrega que se añaden a POST /api/reservas, según el modo.
export type DeliveryRequest =
  | { deliveryMode: 'home' }
  | { deliveryMode: 'pickup_point'; pickupPointId: string }
  | {
      deliveryMode: 'rider';
      slot: string;
      deliveryAddress: string;
      deliveryNeighborhood: string;
    };

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  home: 'Recoger en casa del propietario',
  rider: 'Entrega por rider',
  pickup_point: 'Punto de recogida',
};

// Hasta 200 caracteres, como valida la API.
export const DELIVERY_ADDRESS_MAX_LENGTH = 200;

export function getDeliveryOptions(itemId: string, startDate: string): Promise<DeliveryOptions> {
  const query = new URLSearchParams({ startDate }).toString();
  return apiRequest<DeliveryOptions>(`/objetos/${encodeURIComponent(itemId)}/entrega?${query}`);
}

export function getRiderQuote(itemId: string, neighborhood: string): Promise<RiderQuote> {
  const query = new URLSearchParams({ barrio: neighborhood }).toString();
  return apiRequest<RiderQuote>(`/objetos/${encodeURIComponent(itemId)}/entrega/tarifa?${query}`);
}

// «asap» → «Lo antes posible»; «09:00-11:00» → «09:00 – 11:00».
export function formatSlot(slot: string | null): string {
  if (slot === null || slot === ASAP_SLOT) return 'Lo antes posible';
  return slot.replace('-', ' – ');
}

const distanceFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatDistance(distanceKm: number): string {
  return `${distanceFormatter.format(distanceKm)} km`;
}
