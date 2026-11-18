// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import type {
  RiderApplicationStatus,
  RiderSlot,
  RiderVehicle,
  RiderWeekday,
} from '@prisma/client';
import { prisma } from './prisma.js';

export interface NewRiderAccount {
  username: string;
  email: string;
  passwordHash: string;
  phone: string;
  zone: string;
  vehicle: RiderVehicle;
  days: RiderWeekday[];
  slots: RiderSlot[];
}

// Crea la cuenta y su solicitud en una sola transacción (escritura anidada): o se guardan las
// dos o ninguna. La solicitud nace en «pendiente».
export function createRiderAccount(data: NewRiderAccount) {
  const { phone, zone, vehicle, days, slots, ...account } = data;

  return prisma.user.create({
    data: {
      ...account,
      isRider: true,
      riderApplication: {
        create: {
          phone,
          zone,
          vehicle,
          days,
          slots,
          termsAcceptedAt: new Date(),
        },
      },
    },
    include: { riderApplication: { select: { status: true } } },
  });
}

export async function findRiderFlags(
  userId: string,
): Promise<{ isRider: boolean; status: RiderApplicationStatus | null } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isRider: true, riderApplication: { select: { status: true } } },
  });

  if (!user) return null;
  return {
    isRider: user.isRider,
    status: user.riderApplication?.status ?? null,
  };
}
