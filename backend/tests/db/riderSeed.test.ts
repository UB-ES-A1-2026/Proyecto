// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_RIDERS,
  DEV_PASSWORD,
  upsertDemoRiders,
} from '../../prisma/demoSeed.js';
import { prisma } from '../../src/repositories/prisma.js';
import { isApprovedRider } from '../../src/services/riderService.js';
import { resetDb } from '../helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

describe('upsertDemoRiders (seed de desarrollo, US-10.03)', () => {
  it('creates a pending and an approved rider account with the dev password', async () => {
    const count = await upsertDemoRiders(prisma, DEV_PASSWORD, 4);

    expect(count).toBe(2);
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

  it('does not duplicate anything when run twice and restores the catalog status', async () => {
    await upsertDemoRiders(prisma, DEV_PASSWORD, 4);
    await prisma.riderApplication.updateMany({ data: { status: 'rejected' } });
    await upsertDemoRiders(prisma, DEV_PASSWORD, 4);

    expect(await prisma.user.count()).toBe(DEMO_RIDERS.length);
    expect(await prisma.riderApplication.count()).toBe(DEMO_RIDERS.length);
    const statuses = await prisma.riderApplication.findMany({
      orderBy: { zone: 'asc' },
      select: { status: true },
    });
    expect(statuses.map(({ status }) => status).sort()).toEqual([
      'approved',
      'pending',
    ]);
  });
});
