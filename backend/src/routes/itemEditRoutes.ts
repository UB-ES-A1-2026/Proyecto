import { Router } from 'express';
import { getMyItems, updateItem } from '../controllers/itemEditController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const itemEditRoutes = Router();

itemEditRoutes.get('/usuarios/me/objetos', requireAuth, getMyItems);
itemEditRoutes.patch('/objetos/:id', requireAuth, updateItem);
