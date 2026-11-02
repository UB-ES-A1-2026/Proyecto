import { Router } from 'express';
import { withdrawItem } from '../controllers/itemWithdrawController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const itemWithdrawRoutes = Router();

itemWithdrawRoutes.post('/objetos/:id/retirar', requireAuth, withdrawItem);
