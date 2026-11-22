// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_RIDERS,
  DEV_ADMIN_EMAIL,
  DEV_PASSWORD,
  upsertDemoRiders,
} from '../../prisma/demoSeed.js';
import { prisma } from '../../src/repositories/prisma.js';
import { isApprovedRider } from '../../src/services/riderService.js';
import { resetDb } from '../helpers/db.js';
import { createTestAdmin } from '../helpers/users.js';

beforeEach(async () => {
  await resetDb();
  // Las solicitudes resueltas las revisa el admin del seed (US-11.03).
  await createTestAdmin({ email: DEV_ADMIN_EMAIL });
});

describe('upsertDemoRiders (seed de desarrollo, US-10.03)', () => {
  it('creates a pending, an approved and a rejected rider account with the dev password', async () => {
    const count = await upsertDemoRiders(prisma, DEV_PASSWORD, 4);

    expect(count).toBe(3);
    const carla = await prisma.user.findUniqueOrThrow({
      where: { email: 'carla@rentit.test' },
      include: { riderApplication: true },
    });
    const dani = await prisma.user.findUniqueOrThrow({
      where: { email: 'dani@rentit.test' },
      include: { riderApplication: true },
    });

    expect(carla).toMatchObject({
      username: 'carla',
      isRider: true,
      role: 'user',
    });
    expect(carla.riderApplication?.status).toBe('pending');
    expect(dani).toMatchObject({
      username: 'dani',
      isRider: true,
      role: 'user',
    });
    expect(dani.riderApplication?.status).toBe('approved');
    expect(await bcrypt.compare(DEV_PASSWORD, carla.passwordHash)).toBe(true);
    expect(await isApprovedRider(carla.id)).toBe(false);
    expect(await isApprovedRider(dani.id)).toBe(true);
  });

  it('leaves the resolved applications reviewed by the admin, the rejected one with a reason', async () => {
    await upsertDemoRiders(prisma, DEV_PASSWORD, 4);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: DEV_ADMIN_EMAIL },
    });
    const applications = await prisma.riderApplication.findMany({
      include: { user: true },
    });
    const byName = new Map(
      applications.map((application) => [
        application.user.username,
        application,
      ]),
    );

    expect(byName.get('carla')).toMatchObject({
      status: 'pending',
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
    });
    expect(byName.get('dani')).toMatchObject({
      status: 'approved',
      reviewedById: admin.id,
      rejectionReason: null,
    });
    expect(byName.get('dani')?.reviewedAt).toBeInstanceOf(Date);
    expect(byName.get('eva')).toMatchObject({
      status: 'rejected',
      reviewedById: admin.id,
    });
    expect(byName.get('eva')?.reviewedAt).toBeInstanceOf(Date);
    expect(byName.get('eva')?.rejectionReason).toBeTruthy();
  });

  it('fails with a clear message if the reviewing admin does not exist', async () => {
    await expect(
      upsertDemoRiders(
        prisma,
        DEV_PASSWORD,
        4,
        DEMO_RIDERS,
        'nadie@rentit.test',
      ),
    ).rejects.toThrow('No existe el admin');
  });

  it('does not duplicate anything when run twice and restores the catalog status', async () => {
    await upsertDemoRiders(prisma, DEV_PASSWORD, 4);
    await prisma.riderApplication.updateMany({
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
        rejectionReason: 'otro',
      },
    });
    await upsertDemoRiders(prisma, DEV_PASSWORD, 4);

    // Los riders más el admin que los revisa.
    expect(await prisma.user.count()).toBe(DEMO_RIDERS.length + 1);
    expect(await prisma.riderApplication.count()).toBe(DEMO_RIDERS.length);
    const statuses = await prisma.riderApplication.findMany({
      select: { status: true },
    });
    expect(statuses.map(({ status }) => status).sort()).toEqual([
      'approved',
      'pending',
      'rejected',
    ]);
  });
});
