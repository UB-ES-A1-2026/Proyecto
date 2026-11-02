import { listCategories as findCategories } from '../repositories/categoryRepository.js';

export interface CategoryDto {
  id: string;
  name: string;
}

// Las categorías son datos de referencia que crea la migración (#169).
export function listCategories(): Promise<CategoryDto[]> {
  return findCategories();
}
