import { Router } from 'express';
import { listCategories } from '../controllers/categoryController.js';

export const categoryRoutes = Router();

categoryRoutes.get('/categorias', listCategories);
