// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Alta de rider (US-10.03, T35 #315). Contrato del backend: #322 y #325 (POST /api/riders).
import { apiRequest } from './apiClient';

export type RiderVehicle = 'on_foot' | 'bike' | 'scooter' | 'motorbike' | 'car';
export type RiderWeekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type RiderSlot = 'morning' | 'afternoon' | 'night';

// La API recibe los valores en inglés; la pantalla enseña los textos en español.
export const RIDER_VEHICLES: readonly { value: RiderVehicle; label: string }[] = [
  { value: 'on_foot', label: 'A pie' },
  { value: 'bike', label: 'Bici' },
  { value: 'scooter', label: 'Patinete' },
  { value: 'motorbike', label: 'Moto' },
  { value: 'car', label: 'Coche' },
];

export const RIDER_WEEKDAYS: readonly { value: RiderWeekday; label: string }[] = [
  { value: 'monday', label: 'Lunes' },
  { value: 'tuesday', label: 'Martes' },
  { value: 'wednesday', label: 'Miércoles' },
  { value: 'thursday', label: 'Jueves' },
  { value: 'friday', label: 'Viernes' },
  { value: 'saturday', label: 'Sábado' },
  { value: 'sunday', label: 'Domingo' },
];

export const RIDER_SLOTS: readonly { value: RiderSlot; label: string }[] = [
  { value: 'morning', label: 'Mañana (9 – 14 h)' },
  { value: 'afternoon', label: 'Tarde (14 – 20 h)' },
  { value: 'night', label: 'Noche (20 – 23 h)' },
];

export type RiderApplicationInput = {
  username: string;
  email: string;
  password: string;
  phone: string;
  zone: string;
  vehicle: RiderVehicle | '';
  days: RiderWeekday[];
  slots: RiderSlot[];
  acceptedTerms: boolean;
};

// Respuesta 201 de POST /api/riders: la API no crea sesión.
export type RiderApplicationResult = { message: string; status: 'pending' };

export function applyAsRider(input: RiderApplicationInput): Promise<RiderApplicationResult> {
  return apiRequest<RiderApplicationResult>('/riders', {
    method: 'POST',
    body: {
      ...input,
      username: input.username.trim(),
      email: input.email.trim(),
      zone: input.zone.trim(),
    },
  });
}
