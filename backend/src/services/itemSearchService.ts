// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import {
  searchItems as findItems,
  type ItemSearchCriteria,
} from '../repositories/itemSearchRepository.js';

export const SEARCH_PAGE_SIZE = 20;

export interface ItemSummary {
  id: string;
  title: string;
  dailyPrice: string;
  neighborhood: string;
  category: { id: string; name: string };
  // URL de la primera foto. De momento siempre null: las fotos llegan con #106 (US-02.01),
  // y se rellenará con listItemPhotos() cuando esa historia esté en develop.
  photo: string | null;
}

export interface ItemSearchResult {
  items: ItemSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export async function searchItems(
  criteria: ItemSearchCriteria,
  page: number,
): Promise<ItemSearchResult> {
  const { items, total } = await findItems(criteria, {
    skip: (page - 1) * SEARCH_PAGE_SIZE,
    take: SEARCH_PAGE_SIZE,
  });

  return {
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      dailyPrice: item.dailyPrice.toFixed(2),
      neighborhood: item.neighborhood,
      category: item.category,
      photo: null,
    })),
    page,
    pageSize: SEARCH_PAGE_SIZE,
    total,
  };
}
