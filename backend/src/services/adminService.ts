// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { AppError } from '../errors/appError.js';
import { findUserById } from '../repositories/userRepository.js';

export const ADMIN_ONLY_MESSAGE =
  'Solo un admin puede revisar las solicitudes de rider.';

// Comprobación de rol de las acciones de admin (US-11.03). Está en el servicio y no en un
// middleware: lee el rol de la BD en cada petición, así que quitarle el rol a un admin surte
// efecto al instante aunque su sesión siga activa.
export async function assertAdmin(userId: string): Promise<void> {
  const user = await findUserById(userId);

  if (user?.role !== 'admin') {
    throw new AppError(403, ADMIN_ONLY_MESSAGE);
  }
}
