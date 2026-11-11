// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import type { RequestHandler } from 'express';
import * as riderService from '../services/riderService.js';
import { readRiderBody } from './riderBody.js';

export const registerRider: RequestHandler = async (request, response) => {
  const input = readRiderBody(request.body);
  const result = await riderService.registerRider(input);

  response.status(201).json(result);
};
