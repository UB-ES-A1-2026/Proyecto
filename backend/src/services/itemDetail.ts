// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import type { ItemWithDetail } from '../repositories/detailIncludes.js';

// Representación pública de un objeto: la devuelven POST /api/objetos (#14) y
// GET /api/objetos/:id (#119). Del propietario solo salen id, username y la URL de su foto de
// perfil (US-03.05), nunca el correo.

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
  // Dirección exacta del propietario (US-05.01, #281): solo sale cuando la pide el propio
  // propietario (para rellenar el formulario de editar). Nunca en la API pública.
  address?: string | null;
  // photo: URL de lectura de su foto de perfil, o null (la misma que da su perfil público).
  owner: { id: string; username: string; photo: string | null };
  createdAt: Date;
}

// Los importes salen como texto con 2 decimales ("5.00"), como espera el frontend.
// `includeAddress` es true solo si quien lo pide es el propietario del objeto. `ownerPhoto` es la
// URL ya firmada de la foto de perfil del propietario (photoService.userPhotoUrl).
export function toItemDetail(
  item: ItemWithDetail,
  photos: ItemPhotoDto[],
  includeAddress: boolean,
  ownerPhoto: string | null,
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
    ...(includeAddress ? { address: item.address } : {}),
    owner: {
      id: item.owner.id,
      username: item.owner.username,
      photo: ownerPhoto,
    },
    createdAt: item.createdAt,
  };
}
