import { prisma } from '../../src/repositories/prisma.js';

// Fotos de la entrega ya confirmadas por el propietario (US-09.02, #454). Sin ellas, ni «Ya tengo el
// objeto» ni la recogida del rider funcionan, así que los tests del seguimiento las crean antes.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 27/11/2026
export async function confirmDeliveryPhotos(
  reservationId: string,
  ownerId: string,
): Promise<void> {
  await prisma.statePhoto.create({
    data: {
      reservationId,
      uploadedById: ownerId,
      phase: 'delivery',
      key: `reservas/${reservationId}/entrega/prueba.jpg`,
      order: 1,
      confirmedAt: new Date(),
    },
  });
}
