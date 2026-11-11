// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Reglas de los modos de entrega de un objeto (US-05.01, #281), comunes a publicar y editar.
import { AppError } from '../errors/appError.js';

export const NO_DELIVERY_MODE_MESSAGE = 'Elige al menos un modo de entrega.';
export const ADDRESS_MAX_LENGTH = 200;

export const INVALID_ADDRESS_MESSAGE =
  'El campo "dirección" no es correcto, revísalo.';

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Una dirección vacía o solo con espacios es «sin dirección» (null), no un error: solo falla si el
// objeto la necesita, y eso lo comprueba assertValidDeliverySettings. Más de 200 caracteres o un
// valor que no es texto sí son error.
export function parseAddress(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, INVALID_ADDRESS_MESSAGE, 'address');
  }

  const address = value.trim();
  if (address.length > ADDRESS_MAX_LENGTH) {
    throw new AppError(400, INVALID_ADDRESS_MESSAGE, 'address');
  }

  return address.length === 0 ? null : address;
}

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Modos que se pueden elegir de verdad. Un objeto antiguo puede tener domicilio o rider marcados
// sin dirección (se publicó antes de pedirla): sin ella no se sabe dónde recogerlo, así que esos
// dos modos no se ofrecen hasta que el propietario la añada. La ficha sigue mostrando lo guardado.
export function selectableModes(item: {
  homeDelivery: boolean;
  riderDelivery: boolean;
  pickupPointDelivery: boolean;
  address: string | null;
}): { home: boolean; rider: boolean; pickupPoint: boolean } {
  const hasAddress = item.address !== null && item.address.trim() !== '';

  return {
    home: item.homeDelivery && hasAddress,
    rider: item.riderDelivery && hasAddress,
    pickupPoint: item.pickupPointDelivery,
  };
}

export interface ItemDeliverySettings {
  homeDelivery: boolean;
  riderDelivery: boolean;
  pickupPointDelivery: boolean;
  address: string | null;
}

// Tiene que haber al menos un modo y, si el objeto se recoge en casa del propietario o lo lleva un
// rider, su dirección (sin ella no se sabe dónde recogerlo).
export function assertValidDeliverySettings(
  settings: ItemDeliverySettings,
): void {
  const { homeDelivery, riderDelivery, pickupPointDelivery, address } =
    settings;

  if (!homeDelivery && !riderDelivery && !pickupPointDelivery) {
    throw new AppError(400, NO_DELIVERY_MODE_MESSAGE, 'deliveryModes');
  }

  if ((homeDelivery || riderDelivery) && !address) {
    throw new AppError(400, INVALID_ADDRESS_MESSAGE, 'address');
  }
}
