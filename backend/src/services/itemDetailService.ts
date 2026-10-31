// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import { AppError } from '../errors/appError.js';
import { findItemDetailById } from '../repositories/itemDetailRepository.js';
import { toItemDetail, type ItemDetail } from './itemDetail.js';

export const ITEM_NOT_FOUND_MESSAGE = 'No hemos encontrado este objeto.';

// Ficha de un objeto (US-03.03, #119). Cualquiera ve los publicados; los pausados y retirados
// solo los ve su propietario. Para los demás es como si no existieran (404, no 403), para no
// revelar qué objetos hay.
export async function getItemDetail(
  itemId: string,
  viewerId: string | undefined,
): Promise<ItemDetail> {
  const item = await findItemDetailById(itemId);

  if (!item || (item.status !== 'published' && item.ownerId !== viewerId)) {
    throw new AppError(404, ITEM_NOT_FOUND_MESSAGE);
  }

  // Las fotos llegan con #106 (US-02.01): cuando esa historia esté en develop, aquí se
  // usará listItemPhotos(item.id).
  return toItemDetail(item, []);
}
