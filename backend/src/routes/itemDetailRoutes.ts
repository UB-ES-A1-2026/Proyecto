import { Router } from 'express';
import { getItemDetail } from '../controllers/itemDetailController.js';
import { optionalAuth } from '../middlewares/optionalAuth.js';

export const itemDetailRoutes = Router();

itemDetailRoutes.get('/objetos/:id', optionalAuth, getItemDetail);
