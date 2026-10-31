import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser } from '../helpers/users.js';

// Tablas de objetos del Sprint 1 (#9): comprueba que la migración crea lo que esperan
// las historias US-02.x y US-04.x, incluidas las reglas que solo están en la BD (CHECK).
// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 27/10/2026

beforeEach(async () => {
  await resetDb();
});

describe('categorías', () => {
  it('la migración crea las 8 categorías iniciales y resetDb() las mantiene', async () => {
    const names = (
      await prisma.category.findMany({ orderBy: { name: 'asc' } })
    ).map((category) => category.name);

    expect(names).toEqual([
      'Camping y viajes',
      'Deporte',
      'Electrónica',
      'Fiestas y eventos',
      'Herramientas y bricolaje',
      'Hogar y jardín',
      'Infantil',
      'Otros',
    ]);
  });
});

describe('objeto', () => {
  it('se crea publicado, sin modos de entrega y asociado a su propietario', async () => {
    const owner = await createTestUser();
    const item = await createTestItem(owner.id);

    expect(item.status).toBe('published');
    expect(item.homeDelivery).toBe(false);
    expect(item.riderDelivery).toBe(false);
    expect(item.pickupPointDelivery).toBe(false);
    expect(item.latitude).toBeNull();

    const items = await prisma.item.findMany({ where: { ownerId: owner.id } });
    expect(items.map(({ id }) => id)).toEqual([item.id]);
  });

  it('guarda los importes en euros con dos decimales', async () => {
    const owner = await createTestUser();
    const item = await createTestItem(owner.id, {
      dailyPrice: 4.5,
      deposit: 0,
    });

    expect(item.dailyPrice.toFixed(2)).toBe('4.50');
    expect(item.deposit.toFixed(2)).toBe('0.00');
  });

  it('la BD rechaza un precio por día de 0 o negativo', async () => {
    const owner = await createTestUser();

    await expect(createTestItem(owner.id, { dailyPrice: 0 })).rejects.toThrow(
      'objeto_precio_dia_positivo',
    );
  });

  it('la BD rechaza una fianza negativa', async () => {
    const owner = await createTestUser();

    await expect(createTestItem(owner.id, { deposit: -1 })).rejects.toThrow(
      'objeto_fianza_no_negativa',
    );
  });

  it('no se puede borrar un usuario que tiene objetos', async () => {
    const owner = await createTestUser();
    await createTestItem(owner.id);

    await expect(
      prisma.user.delete({ where: { id: owner.id } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});

describe('foto_objeto', () => {
  it('guarda la clave del fichero y se borra junto con su objeto', async () => {
    const owner = await createTestUser();
    const item = await createTestItem(owner.id);
    await prisma.itemPhoto.create({
      data: { itemId: item.id, key: `objetos/${item.id}/foto-1.jpg`, order: 1 },
    });

    await prisma.item.delete({ where: { id: item.id } });

    expect(await prisma.itemPhoto.count()).toBe(0);
  });

  it('no permite dos fotos con el mismo orden en un objeto', async () => {
    const owner = await createTestUser();
    const item = await createTestItem(owner.id);
    await prisma.itemPhoto.create({
      data: { itemId: item.id, key: 'objetos/a.jpg', order: 1 },
    });

    await expect(
      prisma.itemPhoto.create({
        data: { itemId: item.id, key: 'objetos/b.jpg', order: 1 },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('la BD rechaza una sexta foto (orden fuera de 1 a 5)', async () => {
    const owner = await createTestUser();
    const item = await createTestItem(owner.id);

    await expect(
      prisma.itemPhoto.create({
        data: { itemId: item.id, key: 'objetos/sexta.jpg', order: 6 },
      }),
    ).rejects.toThrow('foto_objeto_orden_entre_1_y_5');
  });
});
