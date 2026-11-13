// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Qué ve una cuenta de rider (US-10.03, decisión de Marc del 13/11): solo el estado de su
// solicitud y «Trabajos». No busca, ni ve fichas, ni alquila, ni publica.
import type { Session } from '../services/authService';

export function isRiderSession(session: Session | null): boolean {
  return session?.user.isRider === true;
}

export function isApprovedRider(session: Session | null): boolean {
  return isRiderSession(session) && session?.user.riderStatus === 'approved';
}

// Página de inicio de un rider: el aceptado va a «Trabajos»; el pendiente o rechazado, al inicio,
// que le enseña el estado de su solicitud.
export const RIDER_JOBS_PATH = '/trabajos';
