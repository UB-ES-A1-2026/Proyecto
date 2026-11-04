import { apiRequest } from './apiClient';

export type SearchItem = {
  id: string;
  title: string;
  dailyPrice: string;
  neighborhood: string;
  category: {
    id: string;
    name: string;
  };
  photo: string | null;
};

export type SearchResponse = {
  items: SearchItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type SearchParams = {
  q?: string;
  page?: string;
  categoryId?: string;
  maxPrice?: string;
  neighborhood?: string;
};

// Generado con asistencia de IA – revisado por Danyal, 31/10/2026
export function searchItems(params: SearchParams): Promise<SearchResponse> {
  const query = new URLSearchParams();
  const entries: [keyof SearchParams, string | undefined][] = [
    ['q', params.q],
    ['page', params.page],
    ['categoryId', params.categoryId],
    ['maxPrice', params.maxPrice],
    ['neighborhood', params.neighborhood],
  ];

  for (const [key, value] of entries) {
    if (value !== undefined && value.trim() !== '') query.set(key, value);
  }

  const search = query.toString();
  return apiRequest<SearchResponse>(`/objetos${search ? `?${search}` : ''}`);
}
