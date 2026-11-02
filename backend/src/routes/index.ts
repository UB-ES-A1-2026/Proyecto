import { Router } from 'express';
import { authRoutes } from './authRoutes.js';
import { categoryRoutes } from './categoryRoutes.js';
import { healthRoutes } from './healthRoutes.js';
import { itemRoutes } from './itemRoutes.js';
import { photoRoutes } from './photoRoutes.js';
import { userRoutes } from './userRoutes.js';

export const apiRoutes = Router();

apiRoutes.use(healthRoutes);
apiRoutes.use(authRoutes);
apiRoutes.use(userRoutes);
apiRoutes.use(categoryRoutes);
apiRoutes.use(itemRoutes);
apiRoutes.use(photoRoutes);
