// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import { AppError } from '../errors/appError.js';
import {
  createItem,
  findCategoryById,
} from '../repositories/itemRepository.js';
import { assertNotRiderAccount } from './riderService.js';
import { toItemDetail, type ItemDetail } from './itemDetail.js';

// Mensaje del criterio 5 de US-02.01: «El campo "X" no es correcto, revísalo.»
export function invalidFieldMessage(label: string): string {
  return `El campo "${label}" no es correcto, revísalo.`;
}

export interface PublishItemInput {
  title: string;
  description: string;
  categoryId: string;
  dailyPrice: string;
  deposit: string;
  neighborhood: string;
  homeDelivery: boolean;
  riderDelivery: boolean;
  pickupPointDelivery: boolean;
  status: 'published' | 'paused';
}

// Publica un objeto a nombre de quien tiene la sesión (criterio 4). Las fotos se suben
// después con su propio endpoint (#106), así que un objeto recién creado no tiene ninguna.
export async function publishItem(
  ownerId: string,
  input: PublishItemInput,
): Promise<ItemDetail> {
  // Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
  // Las cuentas de rider no publican objetos (US-10.03).
  await assertNotRiderAccount(ownerId);

  if (!(await findCategoryById(input.categoryId))) {
    throw new AppError(400, invalidFieldMessage('categoría'), 'categoryId');
  }

  const item = await createItem({ ownerId, ...input });
  return toItemDetail(item, []);
}
