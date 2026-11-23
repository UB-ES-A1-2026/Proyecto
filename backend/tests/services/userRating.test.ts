import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/repositories/prisma.js';
import { getUserRating } from '../../src/services/ratingService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser } from '../helpers/users.js';

// Media de las valoraciones recibidas (US-08.02, #298).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026

beforeEach(async () => {
  await resetDb();
});

// Guarda una valoración directamente en la BD, sin pasar por la API.
async function addRating(
  reservationId: string,
  authorId: string,
  ratedUserId: string,
  score: number,
) {
  await prisma.rating.create({
    data: {
      reservationId,
      authorId,
      ratedUserId,
      type: 'rental',
      score,
    },
  });
}

describe('getUserRating', () => {
  it('returns no average and 0 when the user has no ratings', async () => {
    const ana = await createTestUser();

    expect(await getUserRating(ana.id)).toEqual({ average: null, count: 0 });
  });

  it('averages every rating the user has received, rounded to one decimal', async () => {
    const ana = await createTestUser();
    const bruno = await createTestUser({
      username: 'bruno',
      email: 'bruno@rentit.test',
    });
    const carla = await createTestUser({
      username: 'carla',
      email: 'carla@rentit.test',
    });
    const anaItem = await createTestItem(ana.id);
    const carlaItem = await createTestItem(carla.id, { title: 'Escalera' });
    // ana como propietaria (la valoran bruno y carla) y como arrendataria (la valora carla).
    const byBruno = await createTestReservation(anaItem.id, bruno.id, {
      status: 'finished',
    });
    const byCarla = await createTestReservation(anaItem.id, carla.id, {
      status: 'finished',
    });
    const anaRents = await createTestReservation(carlaItem.id, ana.id, {
      status: 'finished',
    });
    await addRating(byBruno.id, bruno.id, ana.id, 5);
    await addRating(byCarla.id, carla.id, ana.id, 4);
    await addRating(anaRents.id, carla.id, ana.id, 4);
    // La que escribe ana no cuenta en su media: cuenta en la de bruno.
    await addRating(byBruno.id, ana.id, bruno.id, 2);

    expect(await getUserRating(ana.id)).toEqual({ average: 4.3, count: 3 });
    expect(await getUserRating(bruno.id)).toEqual({ average: 2, count: 1 });
    expect(await getUserRating(carla.id)).toEqual({ average: null, count: 0 });
  });
});
