// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Estado del paso «Entrega» de la solicitud de alquiler (US-05.01, #282), compartido entre
// RentalRequest y DeliveryStep.
import type { DeliveryMode, PickupPoint } from '../services/deliveryService';

// Lo que el usuario lleva elegido. Vive en RentalRequest para no perderlo al volver atrás.
export type DeliveryDraft = {
  mode: DeliveryMode | '';
  slot: string;
  address: string;
  neighborhood: string;
  pickupPointId: string;
};

export const EMPTY_DELIVERY_DRAFT: DeliveryDraft = {
  mode: '',
  slot: '',
  address: '',
  neighborhood: '',
  pickupPointId: '',
};

// Lo que pasa al resumen: ya validado y con los datos que hay que enseñar.
export type DeliverySelection =
  | { mode: 'home' }
  | { mode: 'pickup_point'; pickupPoint: PickupPoint }
  | { mode: 'rider'; slot: string; address: string; neighborhood: string; fee: string };

// Errores por campo, con los mismos nombres que el `field` de la API.
export type DeliveryErrors = Partial<
  Record<
    'deliveryMode' | 'slot' | 'deliveryAddress' | 'deliveryNeighborhood' | 'pickupPointId',
    string
  >
>;

export const DELIVERY_ERROR_FIELDS: readonly (keyof DeliveryErrors)[] = [
  'deliveryMode',
  'slot',
  'deliveryAddress',
  'deliveryNeighborhood',
  'pickupPointId',
];
