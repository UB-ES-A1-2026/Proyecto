// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { Router } from 'express';
import {
  confirmPhoto,
  getPublicProfile,
  removePhoto,
  requestPhotoUpload,
  updateOwnProfile,
} from '../controllers/profileController.js';
import { optionalAuth } from '../middlewares/optionalAuth.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// Perfil público de usuario (US-01.4, #300). Se monta después de userRoutes para que
// «/usuarios/me» no lo tape `:id`. Todas las escrituras son sobre «/me»: no hay forma de
// editar a otro usuario.
export const profileRoutes = Router();

profileRoutes.patch('/usuarios/me', requireAuth, updateOwnProfile);
profileRoutes.post('/usuarios/me/foto/subida', requireAuth, requestPhotoUpload);
profileRoutes.post('/usuarios/me/foto', requireAuth, confirmPhoto);
profileRoutes.delete('/usuarios/me/foto', requireAuth, removePhoto);
profileRoutes.get('/usuarios/:id', optionalAuth, getPublicProfile);
