import { Router } from 'express';
import { searchItems } from '../controllers/itemSearchController.js';

export const itemSearchRoutes = Router();

itemSearchRoutes.get('/objetos', searchItems);
