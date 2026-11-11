// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import type { RiderApplicationStatus } from '@prisma/client';

export type RiderStatus = RiderApplicationStatus;

export interface RiderFields {
  isRider: boolean;
  riderStatus: RiderStatus | null;
}

// Campos de rider que se exponen en el login y en GET /api/usuarios/me (US-10.03):
// `riderStatus` es null si la cuenta no es de rider.
export function toRiderFields(user: {
  isRider: boolean;
  riderApplication?: { status: RiderStatus } | null;
}): RiderFields {
  return {
    isRider: user.isRider,
    riderStatus: user.isRider ? (user.riderApplication?.status ?? null) : null,
  };
}
