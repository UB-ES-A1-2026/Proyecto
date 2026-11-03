import { Router } from 'express';
import { authRoutes } from './authRoutes.js';
import { healthRoutes } from './healthRoutes.js';
import { itemEditRoutes } from './itemEditRoutes.js';
import { itemSearchRoutes } from './itemSearchRoutes.js';
import { itemDetailRoutes } from './itemDetailRoutes.js';
import { myReservationsRoutes } from './myReservationsRoutes.js';
import { reservationRoutes } from './reservationRoutes.js';
import { userRoutes } from './userRoutes.js';

export const apiRoutes = Router();

apiRoutes.use(healthRoutes);
apiRoutes.use(authRoutes);
apiRoutes.use(userRoutes);
apiRoutes.use(itemEditRoutes);
apiRoutes.use(itemSearchRoutes);
apiRoutes.use(itemDetailRoutes);
apiRoutes.use(myReservationsRoutes);
apiRoutes.use(reservationRoutes);
