import { Router } from 'express';
import {
  confirmUpload,
  requestUpload,
} from '../controllers/photoController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// Fotos de los objetos (US-02.01, #106; ADR 0002).
export const photoRoutes = Router();

photoRoutes.post('/objetos/:id/fotos/subida', requireAuth, requestUpload);
photoRoutes.post('/objetos/:id/fotos', requireAuth, confirmUpload);
