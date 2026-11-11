// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { Router } from 'express';
import { getPublicProfile } from '../controllers/profileController.js';
import { optionalAuth } from '../middlewares/optionalAuth.js';

// Perfil público de usuario (US-01.4, #300). Se monta después de userRoutes para que
// «/usuarios/me» no lo tape `:id`.
export const profileRoutes = Router();

profileRoutes.get('/usuarios/:id', optionalAuth, getPublicProfile);
