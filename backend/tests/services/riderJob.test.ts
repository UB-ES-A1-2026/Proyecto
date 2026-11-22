// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 21/11/2026
// Trabajos del rider (US-10.01, #292): formato y orden de la lista, sin BD.
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { JobRecord } from '../../src/repositories/riderJobRepository.js';
import {
  compareJobs,
  toAvailableJob,
  toMyJob,
  type AvailableJob,
} from '../../src/services/riderJob.js';

function record(delivery: JobRecord['delivery']): JobRecord {
  return {
    id: 'r1',
    status: 'paid',
    renterId: 'u2',
    deliveryMode: 'rider',
    startDate: new Date('2026-11-23T00:00:00.000Z'),
    item: {
      id: 'i1',
      title: 'Taladro',
      ownerId: 'u1',
      neighborhood: 'Gràcia',
      address: 'Carrer de Verdi, 12',
    },
    delivery,
  };
}

function job(id: string, startDate: string, slot: string): AvailableJob {
  return {
    id,
    item: { id: 'i1', title: 'Taladro' },
    startDate,
    slot,
    fee: '5.00',
    pickupNeighborhood: 'Gràcia',
    deliveryNeighborhood: 'Eixample',
  };
}

describe('toAvailableJob y toMyJob', () => {
  it('sin franja es «asap» y la tarifa va con dos decimales', () => {
    const delivery = {
      status: 'assigned' as const,
      slot: null,
      fee: new Prisma.Decimal(3),
      deliveryNeighborhood: 'Eixample',
      deliveryAddress: 'Carrer de Mallorca, 120',
      riderId: 'rider',
    };

    expect(toAvailableJob(record(delivery))).toEqual({
      id: 'r1',
      item: { id: 'i1', title: 'Taladro' },
      startDate: '2026-11-23',
      slot: 'asap',
      fee: '3.00',
      pickupNeighborhood: 'Gràcia',
      deliveryNeighborhood: 'Eixample',
    });
    expect(toMyJob(record(delivery))).toMatchObject({
      pickupAddress: 'Carrer de Verdi, 12',
      deliveryAddress: 'Carrer de Mallorca, 120',
      status: 'assigned',
    });
  });

  it('una reserva sin entrega no rompe el formato', () => {
    expect(toMyJob(record(null))).toMatchObject({
      slot: 'asap',
      fee: null,
      deliveryNeighborhood: null,
      deliveryAddress: null,
      status: 'pending',
    });
  });
});

describe('compareJobs', () => {
  it('ordena por fecha, «asap» primero, luego por franja y por id', () => {
    const jobs = [
      job('c', '2026-11-23', '11:00-13:00'),
      job('b', '2026-11-23', '09:00-11:00'),
      job('a', '2026-11-23', '09:00-11:00'),
      job('d', '2026-11-23', 'asap'),
      job('e', '2026-11-22', '21:00-23:00'),
    ];

    expect(jobs.sort(compareJobs).map(({ id }) => id)).toEqual([
      'e',
      'd',
      'a',
      'b',
      'c',
    ]);
    expect(compareJobs(jobs[0]!, jobs[0]!)).toBe(0);
  });
});
