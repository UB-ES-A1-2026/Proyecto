// Fotos del estado del objeto (US-09.02, #454). :id es el de la reserva, como en el seguimiento.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 27/11/2026
import type { RequestHandler } from 'express';
import * as statePhotoService from '../services/statePhotoService.js';

type PhaseParams = { id: string; fase: string };

// GET /api/entregas/:id/fotos. requireAuth garantiza que request.auth existe.
export const getStatePhotos: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  response
    .status(200)
    .json(
      await statePhotoService.getStatePhotos(
        request.auth!.userId,
        request.params.id,
      ),
    );
};

// POST /api/entregas/:id/fotos/:fase/subida
export const requestUpload: RequestHandler<PhaseParams> = async (
  request,
  response,
) => {
  const phase = statePhotoService.parsePhase(request.params.fase);
  response
    .status(201)
    .json(
      await statePhotoService.requestStatePhotoUpload(
        request.auth!.userId,
        request.params.id,
        phase,
        request.body,
      ),
    );
};

// POST /api/entregas/:id/fotos/:fase
export const confirmUpload: RequestHandler<PhaseParams> = async (
  request,
  response,
) => {
  const phase = statePhotoService.parsePhase(request.params.fase);
  response
    .status(201)
    .json(
      await statePhotoService.confirmStatePhotoUpload(
        request.auth!.userId,
        request.params.id,
        phase,
        request.body,
      ),
    );
};

// DELETE /api/entregas/:id/fotos/:fase/:fotoId
export const deletePhoto: RequestHandler<
  PhaseParams & { fotoId: string }
> = async (request, response) => {
  const phase = statePhotoService.parsePhase(request.params.fase);
  await statePhotoService.deleteStatePhoto(
    request.auth!.userId,
    request.params.id,
    phase,
    request.params.fotoId,
  );
  response.status(204).end();
};

// POST /api/entregas/:id/fotos/:fase/confirmar
export const confirmPhase: RequestHandler<PhaseParams> = async (
  request,
  response,
) => {
  const phase = statePhotoService.parsePhase(request.params.fase);
  response
    .status(200)
    .json(
      await statePhotoService.confirmStatePhotoPhase(
        request.auth!.userId,
        request.params.id,
        phase,
      ),
    );
};
