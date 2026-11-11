// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
// Validación del cuerpo de POST /api/riders (US-10.03): datos de cuenta y cuestionario.
import { AppError } from '../errors/appError.js';
import {
  asRecord,
  readAccountFields,
  type AccountFields,
} from './accountFields.js';

export const RIDER_VEHICLES = [
  'on_foot',
  'bike',
  'scooter',
  'motorbike',
  'car',
] as const;
export const RIDER_WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
// Mañana 9-14 h, tarde 14-20 h, noche 20-23 h.
export const RIDER_SLOTS = ['morning', 'afternoon', 'night'] as const;

export type RiderVehicleValue = (typeof RIDER_VEHICLES)[number];
export type RiderWeekdayValue = (typeof RIDER_WEEKDAYS)[number];
export type RiderSlotValue = (typeof RIDER_SLOTS)[number];

export interface RiderBody extends AccountFields {
  phone: string;
  zone: string;
  vehicle: RiderVehicleValue;
  days: RiderWeekdayValue[];
  slots: RiderSlotValue[];
}

export const TERMS_NOT_ACCEPTED_MESSAGE = 'Tienes que aceptar las condiciones.';

// Teléfono español: 9 dígitos, con prefijo +34 o 0034 opcional y espacios permitidos.
const PHONE_PATTERN = /^(?:\+34|0034)?(\d{9})$/;
const ZONE_MIN_LENGTH = 2;
const ZONE_MAX_LENGTH = 100;

function invalid(field: string, label: string): never {
  throw new AppError(
    400,
    `El campo "${label}" no es correcto, revísalo.`,
    field,
  );
}

function readPhone(value: unknown): string {
  const match =
    typeof value === 'string'
      ? PHONE_PATTERN.exec(value.replace(/\s+/g, ''))
      : null;
  if (!match?.[1]) invalid('phone', 'teléfono');
  return match[1];
}

function readZone(value: unknown): string {
  const zone = typeof value === 'string' ? value.trim() : '';
  if (zone.length < ZONE_MIN_LENGTH || zone.length > ZONE_MAX_LENGTH) {
    invalid('zone', 'zona');
  }
  return zone;
}

function readOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  label: string,
): T {
  const found = allowed.find((option) => option === value);
  if (found === undefined) invalid(field, label);
  return found;
}

// Lista no vacía, sin repetidos y solo con valores permitidos.
function readUniqueList<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  label: string,
): T[] {
  if (!Array.isArray(value) || value.length === 0) invalid(field, label);

  const items = value.map((item: unknown) =>
    readOneOf(item, allowed, field, label),
  );
  if (new Set(items).size !== items.length) invalid(field, label);
  return items;
}

export function readRiderBody(body: unknown): RiderBody {
  const account = readAccountFields(body);
  const fields = asRecord(body);

  const phone = readPhone(fields.phone);
  const zone = readZone(fields.zone);
  const vehicle = readOneOf(
    fields.vehicle,
    RIDER_VEHICLES,
    'vehicle',
    'vehículo',
  );
  const days = readUniqueList(fields.days, RIDER_WEEKDAYS, 'days', 'días');
  const slots = readUniqueList(fields.slots, RIDER_SLOTS, 'slots', 'franjas');

  if (fields.acceptedTerms !== true) {
    throw new AppError(400, TERMS_NOT_ACCEPTED_MESSAGE, 'acceptedTerms');
  }

  return { ...account, phone, zone, vehicle, days, slots };
}
