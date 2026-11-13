import type { RiderSlot, RiderVehicle, RiderWeekday } from '../services/adminRiderService';

// Textos de los datos del cuestionario de rider (US-10.03), comunes a las pantallas del admin.
export const VEHICLE_LABELS: Record<RiderVehicle, string> = {
  on_foot: 'A pie',
  bike: 'Bici',
  scooter: 'Patinete',
  motorbike: 'Moto',
  car: 'Coche',
};

export const WEEKDAY_LABELS: Record<RiderWeekday, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

// En las tablas: L, M, X, J, V, S, D.
export const WEEKDAY_SHORT: Record<RiderWeekday, string> = {
  monday: 'L',
  tuesday: 'M',
  wednesday: 'X',
  thursday: 'J',
  friday: 'V',
  saturday: 'S',
  sunday: 'D',
};

export const WEEKDAY_ORDER: RiderWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const SLOT_LABELS: Record<RiderSlot, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  night: 'Noche',
};
