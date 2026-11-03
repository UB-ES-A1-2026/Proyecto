import { Router } from 'express';
import { publishItem } from '../controllers/itemController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const itemRoutes = Router();

itemRoutes.post('/objetos', requireAuth, publishItem);
