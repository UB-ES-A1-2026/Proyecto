import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ITEMS } from '../../prisma/demoData.js';
import {
  DEMO_USERS,
  DEV_PASSWORD,
  demoPasswordError,
  upsertDemoItems,
  upsertUsers,
} from '../../prisma/demoSeed.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';

// Datos de demo (#97): las cuentas y los objetos se crean bien, no se duplican al repetir el
// seed y la contraseña de la demo nunca puede ser la pública del seed de desarrollo.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026

const DEMO_PASSWORD = 'una-contraseña-larga';

async function seedDemo(password = DEMO_PASSWORD) {
  const ownerIds = await upsertUsers(prisma, DEMO_USERS, password, 4);
  await upsertDemoItems(prisma, ownerIds);
  return ownerIds;
}

beforeEach(async () => {
  await resetDb();
});

describe('demoPasswordError', () => {
  it('rechaza una contraseña vacía, corta o la del seed de desarrollo', () => {
    expect(demoPasswordError(undefined)).toMatch('DEMO_PASSWORD');
    expect(demoPasswordError('')).toMatch('DEMO_PASSWORD');
    expect(demoPasswordError('corta')).toMatch('al menos 12');
    expect(demoPasswordError(DEV_PASSWORD)).not.toBeNull();
  });

  it('acepta una contraseña de 12 caracteres o más', () => {
    expect(demoPasswordError(DEMO_PASSWORD)).toBeNull();
  });
});

describe('seed de la demo', () => {
  it('crea las 3 cuentas con la contraseña indicada, guardada solo como hash', async () => {
    await seedDemo();

    const users = await prisma.user.findMany({ orderBy: { username: 'asc' } });
    expect(users.map(({ email }) => email)).toEqual([
      'jordi@demo.rentit.test',
      'laura@demo.rentit.test',
      'marta@demo.rentit.test',
    ]);
    for (const user of users) {
      expect(user.passwordHash).not.toContain(DEMO_PASSWORD);
      expect(await bcrypt.compare(DEMO_PASSWORD, user.passwordHash)).toBe(true);
    }
  });

  it('crea todos los objetos del catálogo con su propietario, categoría y estado', async () => {
    const ownerIds = await seedDemo();

    const items = await prisma.item.findMany({ include: { category: true } });
    expect(items).toHaveLength(DEMO_ITEMS.length);

    for (const demo of DEMO_ITEMS) {
      const item = items.find(({ title }) => title === demo.title);
      expect(item?.ownerId).toBe(ownerIds[demo.owner]);
      expect(item?.category.name).toBe(demo.category);
      expect(item?.status).toBe(demo.status);
      expect(item?.dailyPrice.toNumber()).toBe(demo.dailyPrice);
    }
  });

  it('cada cuenta de la demo publica algo y hay al menos un objeto pausado', async () => {
    const ownerIds = await seedDemo();

    for (const ownerId of ownerIds) {
      expect(
        await prisma.item.count({ where: { ownerId, status: 'published' } }),
      ).toBeGreaterThan(0);
    }
    expect(
      await prisma.item.count({ where: { status: 'paused' } }),
    ).toBeGreaterThan(0);
  });

  it('se puede repetir: no duplica nada y actualiza la contraseña', async () => {
    await seedDemo();
    await seedDemo('otra-contraseña-larga');

    expect(await prisma.user.count()).toBe(DEMO_USERS.length);
    expect(await prisma.item.count()).toBe(DEMO_ITEMS.length);

    const laura = await prisma.user.findUniqueOrThrow({
      where: { email: 'laura@demo.rentit.test' },
    });
    expect(
      await bcrypt.compare('otra-contraseña-larga', laura.passwordHash),
    ).toBe(true);
  });

  it('falla con un mensaje claro si falta un propietario', async () => {
    await expect(upsertDemoItems(prisma, [])).rejects.toThrow(
      'Falta el propietario',
    );
  });
});
