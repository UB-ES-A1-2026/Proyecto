import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  canCancel,
  daysUntilStart,
  penaltyAmountFor,
  penaltyPercentFor,
  planCancellation,
  type CancellationSnapshot,
} from '../../src/services/cancellationPolicy.js';

// Reglas de la cancelación con penalización (US-04.05, #308 y #64), sin base de datos.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026

// Mediodía en España: el 17/11/2026 es hoy tanto en UTC como en Madrid.
const NOW = new Date('2026-11-17T11:00:00.000Z');

function start(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function decimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function paid(
  startDate: string,
  overrides: Partial<NonNullable<CancellationSnapshot['payment']>> = {},
): CancellationSnapshot {
  return {
    status: 'paid',
    startDate: start(startDate),
    totalPrice: decimal(20),
    payment: {
      status: 'paid',
      rentalAmount: decimal(20),
      deliveryAmount: decimal(3),
      depositStatus: 'held',
      rentalReference: 'alquiler_ref',
      depositReference: 'fianza_ref',
      ...overrides,
    },
  };
}

describe('daysUntilStart', () => {
  it('cuenta los días hasta el inicio desde hoy', () => {
    expect(daysUntilStart(start('2026-11-17'), NOW)).toBe(0);
    expect(daysUntilStart(start('2026-11-18'), NOW)).toBe(1);
    expect(daysUntilStart(start('2026-11-25'), NOW)).toBe(8);
  });

  it('una fecha pasada da un número negativo', () => {
    expect(daysUntilStart(start('2026-11-15'), NOW)).toBe(-2);
  });

  it('usa la fecha de España: a las 23:30 UTC ya es mañana en Madrid', () => {
    const lateUtc = new Date('2026-11-17T23:30:00.000Z');

    expect(daysUntilStart(start('2026-11-20'), lateUtc)).toBe(2);
    // A la misma hora, en UTC todavía faltarían 3 días: la diferencia es la que cambia el %.
    expect(
      penaltyPercentFor(daysUntilStart(start('2026-11-20'), lateUtc)),
    ).toBe(100);
    expect(penaltyPercentFor(daysUntilStart(start('2026-11-20'), NOW))).toBe(
      35,
    );
  });

  it('en verano (UTC+2) el cambio de día también es el de España', () => {
    const lateUtc = new Date('2026-07-10T22:30:00.000Z');

    expect(daysUntilStart(start('2026-07-12'), lateUtc)).toBe(1);
  });
});

describe('penaltyPercentFor', () => {
  it.each([
    [-3, 100],
    [0, 100],
    [1, 100],
    [2, 100],
    [3, 35],
    [5, 35],
    [7, 35],
    [8, 0],
    [30, 0],
  ])('con %i días de margen la penalización es el %i %%', (days, percent) => {
    expect(penaltyPercentFor(days)).toBe(percent);
  });
});

describe('penaltyAmountFor', () => {
  it('es el porcentaje del alquiler, a 2 decimales', () => {
    expect(penaltyAmountFor(decimal(20), 35).toFixed(2)).toBe('7.00');
    expect(penaltyAmountFor(decimal(20), 100).toFixed(2)).toBe('20.00');
    expect(penaltyAmountFor(decimal(20), 0).toFixed(2)).toBe('0.00');
    expect(penaltyAmountFor(decimal('10.10'), 35).toFixed(2)).toBe('3.54');
  });
});

describe('canCancel', () => {
  it('el arrendatario cancela pendientes, aceptadas y pagadas', () => {
    expect(
      (['pending', 'accepted', 'paid'] as const).every((status) =>
        canCancel('renter', status),
      ),
    ).toBe(true);
  });

  it('el propietario cancela aceptadas y pagadas, no pendientes', () => {
    expect(canCancel('owner', 'accepted')).toBe(true);
    expect(canCancel('owner', 'paid')).toBe(true);
    expect(canCancel('owner', 'pending')).toBe(false);
  });

  it.each([
    'cancelled',
    'rejected',
    'expired',
    'in_progress',
    'finished',
  ] as const)('nadie cancela una reserva «%s»', (status) => {
    expect(canCancel('renter', status)).toBe(false);
    expect(canCancel('owner', status)).toBe(false);
  });
});

describe('planCancellation', () => {
  it('devuelve null si ya no se puede cancelar', () => {
    expect(
      planCancellation(
        'renter',
        { ...paid('2026-11-25'), status: 'finished' },
        NOW,
      ),
    ).toBeNull();
    expect(
      planCancellation(
        'owner',
        { ...paid('2026-11-25'), status: 'pending' },
        NOW,
      ),
    ).toBeNull();
  });

  it('pendiente con el importe bloqueado: gratis y se libera el bloqueo', () => {
    const plan = planCancellation(
      'renter',
      {
        ...paid('2026-11-18'),
        status: 'pending',
        payment: {
          ...paid('2026-11-18').payment!,
          status: 'authorized',
          depositStatus: 'pending',
        },
      },
      NOW,
    );

    expect(plan).toMatchObject({
      penaltyPercent: 0,
      free: true,
      releasesHold: true,
      paymentStatus: 'released',
      gatewayCalls: [{ action: 'release', reference: 'alquiler_ref' }],
    });
    expect(plan?.refundAmount.toFixed(2)).toBe('0.00');
  });

  it('aceptada sin pago: gratis aunque empiece mañana, y no hay nada que mover', () => {
    const plan = planCancellation(
      'owner',
      {
        status: 'accepted',
        startDate: start('2026-11-18'),
        totalPrice: decimal(20),
        payment: null,
      },
      NOW,
    );

    expect(plan).toMatchObject({
      penaltyPercent: 0,
      free: true,
      releasesHold: false,
      gatewayCalls: [],
    });
  });

  it('pagada, cancela el arrendatario: se le devuelve lo pagado menos la penalización, con la entrega entera', () => {
    const plan = planCancellation('renter', paid('2026-11-22'), NOW);

    expect(plan?.daysUntilStart).toBe(5);
    expect(plan?.penaltyPercent).toBe(35);
    expect(plan?.penaltyAmount.toFixed(2)).toBe('7.00');
    // 20 de alquiler + 3 de entrega − 7 de penalización.
    expect(plan?.refundAmount.toFixed(2)).toBe('16.00');
    expect(plan).toMatchObject({ free: false, paymentStatus: 'refunded' });
    expect(plan?.gatewayCalls).toEqual([
      { action: 'release', reference: 'fianza_ref' },
      { action: 'refund', reference: 'alquiler_ref', amountCents: 1600 },
    ]);
  });

  it('pagada, cancela el propietario: se devuelve todo y la penalización solo se registra', () => {
    const plan = planCancellation('owner', paid('2026-11-22'), NOW);

    expect(plan?.penaltyPercent).toBe(35);
    expect(plan?.penaltyAmount.toFixed(2)).toBe('7.00');
    expect(plan?.refundAmount.toFixed(2)).toBe('23.00');
    expect(plan?.gatewayCalls).toContainEqual({
      action: 'refund',
      reference: 'alquiler_ref',
      amountCents: 2300,
    });
  });

  it('el alquiler entero como penalización: solo se devuelve la entrega', () => {
    const plan = planCancellation('renter', paid('2026-11-18'), NOW);

    expect(plan?.penaltyPercent).toBe(100);
    expect(plan?.refundAmount.toFixed(2)).toBe('3.00');
  });

  it('el alquiler entero como penalización y sin entrega: no hay reembolso y el pago sigue «pagado»', () => {
    const plan = planCancellation(
      'renter',
      paid('2026-11-17', { deliveryAmount: decimal(0), depositStatus: null }),
      NOW,
    );

    expect(plan?.refundAmount.toFixed(2)).toBe('0.00');
    expect(plan?.paymentStatus).toBeUndefined();
    expect(plan?.gatewayCalls).toEqual([]);
  });

  it('con 8 días o más no hay penalización y se devuelve todo', () => {
    const plan = planCancellation('renter', paid('2026-11-25'), NOW);

    expect(plan?.penaltyPercent).toBe(0);
    expect(plan?.penaltyAmount.toFixed(2)).toBe('0.00');
    expect(plan?.refundAmount.toFixed(2)).toBe('23.00');
    expect(plan?.free).toBe(false);
  });

  it('la fianza: retenida se libera, cobrada se devuelve, pendiente se marca liberada y sin fianza no se toca', () => {
    const held = planCancellation('renter', paid('2026-11-25'), NOW);
    const collected = planCancellation(
      'renter',
      paid('2026-11-25', { depositStatus: 'collected' }),
      NOW,
    );
    const pending = planCancellation(
      'renter',
      paid('2026-11-25', { depositStatus: 'pending' }),
      NOW,
    );
    const none = planCancellation(
      'renter',
      paid('2026-11-25', { depositStatus: null }),
      NOW,
    );

    expect(held).toMatchObject({ depositStatus: 'released' });
    expect(held?.gatewayCalls[0]).toEqual({
      action: 'release',
      reference: 'fianza_ref',
    });
    expect(collected).toMatchObject({ depositStatus: 'returned' });
    expect(collected?.gatewayCalls[0]).toEqual({
      action: 'refund',
      reference: 'fianza_ref',
    });
    expect(pending).toMatchObject({ depositStatus: 'released' });
    expect(pending?.gatewayCalls).toHaveLength(1);
    expect(none?.depositStatus).toBeUndefined();
    expect(none?.gatewayCalls).toHaveLength(1);
  });

  it('sin referencias (pagos de demo) no llama a la pasarela pero actualiza los estados', () => {
    const plan = planCancellation(
      'renter',
      paid('2026-11-22', { rentalReference: null, depositReference: null }),
      NOW,
    );

    expect(plan?.gatewayCalls).toEqual([]);
    expect(plan).toMatchObject({
      paymentStatus: 'refunded',
      depositStatus: 'released',
    });
  });
});
