// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 13/11/2026
import type { RequestHandler } from 'express';
import * as adminItemWithdrawService from '../services/adminItemWithdrawService.js';

// POST /api/admin/objetos/:id/retirar (US-11.03, #317). requireAuth garantiza request.auth.
export const withdrawItemAsAdmin: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  await adminItemWithdrawService.withdrawItemAsAdmin(
    request.auth!.userId,
    request.params.id,
    request.body,
  );

  response.status(204).end();
};
