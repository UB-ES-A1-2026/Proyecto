// Generado con asistencia de IA (Claude)
import { apiRequest } from './apiClient';

// Solicitudes para ser rider que revisa el admin (US-11.03, #318). Los campos son los de
// RiderApplication (US-10.03); la revisión (quién, cuándo y el motivo) la añade el backend en #317.
export type RiderVehicle = 'on_foot' | 'bike' | 'scooter' | 'motorbike' | 'car';
export type RiderWeekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type RiderSlot = 'morning' | 'afternoon' | 'night';
export type RiderApplicationStatus = 'pending' | 'approved' | 'rejected';

export type RiderApplication = {
  id: string;
  status: RiderApplicationStatus;
  createdAt: string;
  phone: string;
  zone: string;
  vehicle: RiderVehicle;
  days: RiderWeekday[];
  slots: RiderSlot[];
  termsAcceptedAt: string;
  user: { id: string; username: string; email: string };
  reviewedAt: string | null;
  reviewedBy: { id: string; username: string } | null;
  rejectionReason: string | null;
  // Entregas que el rider ha completado (0 si aún no es rider). Lo calcula el backend en #317.
  deliveriesCount: number;
};

export function getRiderApplications(token: string): Promise<RiderApplication[]> {
  return apiRequest<RiderApplication[]>('/admin/riders', { token });
}

export function acceptRiderApplication(token: string, id: string): Promise<RiderApplication> {
  return apiRequest<RiderApplication>(`/admin/riders/${encodeURIComponent(id)}/aceptar`, {
    method: 'POST',
    token,
  });
}

export function rejectRiderApplication(
  token: string,
  id: string,
  reason: string,
): Promise<RiderApplication> {
  return apiRequest<RiderApplication>(`/admin/riders/${encodeURIComponent(id)}/rechazar`, {
    method: 'POST',
    token,
    body: reason ? { reason } : {},
  });
}
