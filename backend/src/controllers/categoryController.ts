import type { RequestHandler } from 'express';
import * as categoryService from '../services/categoryService.js';

// GET /api/categorias (contrato de #117): público, [{ id, name }] ordenado por nombre.
// Lo usan el formulario de publicar (#13) y el panel de filtros (#118).
export const listCategories: RequestHandler = async (_request, response) => {
  response.status(200).json(await categoryService.listCategories());
};
