import { Router } from 'express';
import { login, logout } from '../controllers/authController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const authRoutes = Router();

authRoutes.post('/auth/login', login);
authRoutes.post('/auth/logout', requireAuth, logout);
