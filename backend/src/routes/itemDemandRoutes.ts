import { Router } from 'express';
import { getItemDemand } from '../controllers/itemDemandController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const itemDemandRoutes = Router();

itemDemandRoutes.get('/objetos/:id/demanda', requireAuth, getItemDemand);
