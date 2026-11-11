// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { Router } from 'express';
import {
  getDeliveryOptions,
  getRiderQuote,
} from '../controllers/itemDeliveryController.js';

export const itemDeliveryRoutes = Router();

itemDeliveryRoutes.get('/objetos/:id/entrega', getDeliveryOptions);
itemDeliveryRoutes.get('/objetos/:id/entrega/tarifa', getRiderQuote);
