import { Router } from 'express';
import { getItemDemand } from '../controllers/itemDemandController.js';
import { optionalAuth } from '../middlewares/optionalAuth.js';

export const itemDemandRoutes = Router();

itemDemandRoutes.get('/objetos/:id/demanda', optionalAuth, getItemDemand);
