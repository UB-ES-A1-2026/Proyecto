import { Router } from 'express';
import { login, logout, register } from '../controllers/authController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const authRoutes = Router();

authRoutes.post('/auth/register', register);
authRoutes.post('/auth/login', login);
authRoutes.post('/auth/logout', requireAuth, logout);
