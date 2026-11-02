import { Router } from 'express';
import { pauseItem, resumeItem } from '../controllers/itemPauseController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const itemPauseRoutes = Router();

itemPauseRoutes.post('/objetos/:id/pausar', requireAuth, pauseItem);
itemPauseRoutes.post('/objetos/:id/reanudar', requireAuth, resumeItem);
