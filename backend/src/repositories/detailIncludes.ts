import type { Prisma } from '@prisma/client';

// Qué relaciones cargan las consultas de un objeto o una reserva. Viven aquí porque son parte de
// la consulta: los repositories las usan y los services solo importan sus tipos.

export const itemDetailInclude = {
  category: { select: { id: true, name: true } },
  owner: { select: { id: true, username: true } },
} satisfies Prisma.ItemInclude;

export type ItemWithDetail = Prisma.ItemGetPayload<{
  include: typeof itemDetailInclude;
}>;

export const reservationDetailInclude = {
  item: {
    select: {
      id: true,
      title: true,
      owner: { select: { id: true, username: true } },
    },
  },
  renter: { select: { id: true, username: true } },
} satisfies Prisma.ReservationInclude;

export type ReservationWithDetail = Prisma.ReservationGetPayload<{
  include: typeof reservationDetailInclude;
}>;
