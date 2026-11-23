// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Apartado «Entrega» de publicar y editar un objeto (US-05.01, T27 #307). Lo comparten
// PublishItemPage y EditItemDialog, con los mismos textos y reglas que el backend (#321).
import type { IconName } from '../components/Icon';

export type DeliveryModes = {
  homeDelivery: boolean;
  riderDelivery: boolean;
  pickupPointDelivery: boolean;
};

// Nombres validados en el wireframe de US-05.01 (12/11/2026).
export const DELIVERY_MODE_LABELS: Record<keyof DeliveryModes, string> = {
  homeDelivery: 'Recoger en casa del propietario',
  riderDelivery: 'Entrega por rider',
  pickupPointDelivery: 'Punto de recogida',
};

export const DELIVERY_MODE_ICONS: Record<keyof DeliveryModes, IconName> = {
  homeDelivery: 'home',
  riderDelivery: 'directions_bike',
  pickupPointDelivery: 'pin_drop',
};

export const DELIVERY_MODE_FIELDS = Object.keys(DELIVERY_MODE_LABELS) as (keyof DeliveryModes)[];

export const ADDRESS_MAX = 200;
export const NO_DELIVERY_MODE_ERROR = 'Elige al menos un modo de entrega.';
export const ADDRESS_ERROR = 'El campo "dirección" no es correcto, revísalo.';
export const DELIVERY_HINT = 'Marca todas las formas que ofreces. El arrendatario elegirá una.';
export const ADDRESS_HINT =
  'Solo la ves tú. Si el arrendatario elige recogerlo en tu casa, la verá cuando aceptes su solicitud; con rider, solo la ve el rider.';
export const PICKUP_ONLY_HINT = 'Solo punto de recogida: no hace falta tu dirección.';

// La dirección solo hace falta (y solo se ve) con recogida en casa o con rider.
export function needsAddress(modes: DeliveryModes): boolean {
  return modes.homeDelivery || modes.riderDelivery;
}

export type DeliveryErrors = { deliveryModes?: string; address?: string };

export function validateDelivery(modes: DeliveryModes, address: string): DeliveryErrors {
  const errors: DeliveryErrors = {};
  if (!modes.homeDelivery && !modes.riderDelivery && !modes.pickupPointDelivery) {
    errors.deliveryModes = NO_DELIVERY_MODE_ERROR;
  }
  const trimmed = address.trim();
  if (needsAddress(modes) && (trimmed.length === 0 || trimmed.length > ADDRESS_MAX)) {
    errors.address = ADDRESS_ERROR;
  }
  return errors;
}
