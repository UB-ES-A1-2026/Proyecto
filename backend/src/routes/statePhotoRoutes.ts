import { Router } from 'express';
import {
  confirmPhase,
  confirmUpload,
  deletePhoto,
  getStatePhotos,
  requestUpload,
} from '../controllers/statePhotoController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// Fotos del estado del objeto (US-09.02, #454; ADR 0002). :id es el de la reserva y :fase,
// «entrega» (US-09.03 añadirá «devolucion»).
export const statePhotoRoutes = Router();

statePhotoRoutes.get('/entregas/:id/fotos', requireAuth, getStatePhotos);
statePhotoRoutes.post(
  '/entregas/:id/fotos/:fase/subida',
  requireAuth,
  requestUpload,
);
statePhotoRoutes.post(
  '/entregas/:id/fotos/:fase/confirmar',
  requireAuth,
  confirmPhase,
);
statePhotoRoutes.post('/entregas/:id/fotos/:fase', requireAuth, confirmUpload);
statePhotoRoutes.delete(
  '/entregas/:id/fotos/:fase/:fotoId',
  requireAuth,
  deletePhoto,
);
