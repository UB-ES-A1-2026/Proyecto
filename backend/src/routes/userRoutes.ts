import { Router } from 'express';
import { getProfile } from '../controllers/userController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const userRoutes = Router();

userRoutes.get('/usuarios/me', requireAuth, getProfile);
