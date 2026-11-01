// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import type { Prisma } from '@prisma/client';

// Representación pública de un objeto: la devuelven POST /api/objetos (#14) y
// GET /api/objetos/:id (#119). Del propietario solo salen id y username, nunca el correo.

export const itemDetailInclude = {
  category: { select: { id: true, name: true } },
  owner: { select: { id: true, username: true } },
} satisfies Prisma.ItemInclude;

export type ItemWithDetail = Prisma.ItemGetPayload<{
  include: typeof itemDetailInclude;
}>;

export interface ItemPhotoDto {
  id: string;
  url: string;
}

export interface ItemDetail {
  id: string;
  title: string;
  description: string;
  dailyPrice: string;
  deposit: string;
  neighborhood: string;
  status: 'published' | 'paused' | 'withdrawn';
  category: { id: string; name: string };
  photos: ItemPhotoDto[];
  homeDelivery: boolean;
  riderDelivery: boolean;
  pickupPointDelivery: boolean;
  owner: { id: string; username: string };
  createdAt: Date;
}

// Los importes salen como texto con 2 decimales ("5.00"), como espera el frontend.
export function toItemDetail(
  item: ItemWithDetail,
  photos: ItemPhotoDto[],
): ItemDetail {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    dailyPrice: item.dailyPrice.toFixed(2),
    deposit: item.deposit.toFixed(2),
    neighborhood: item.neighborhood,
    status: item.status,
    category: item.category,
    photos,
    homeDelivery: item.homeDelivery,
    riderDelivery: item.riderDelivery,
    pickupPointDelivery: item.pickupPointDelivery,
    owner: item.owner,
    createdAt: item.createdAt,
  };
}
