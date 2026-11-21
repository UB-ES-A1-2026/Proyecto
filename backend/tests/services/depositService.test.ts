// Fianza el día antes de empezar (US-07.01, T10 #285), con la pasarela espiada.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/repositories/prisma.js';
import { settleDueDeposits } from '../../src/services/depositService.js';
import { getMyReservations } from '../../src/services/myReservationsService.js';
import {
  authorizeDeposit,
  refund,
  release,
} from '../../src/services/paymentGateway.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser } from '../helpers/users.js';

vi.mock('../../src/services/paymentGateway.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/services/paymentGateway.js')
    >();
  return {
    ...actual,
    authorizeDeposit: vi.fn(),
    release: vi.fn(),
    refund: vi.fn(),
  };
});

const authorizeDepositMock = vi.mocked(authorizeDeposit);
const releaseMock = vi.mocked(release);
const refundMock = vi.mocked(refund);
// 10/12/2026 a mediodía en España.
const NOW = new Date('2026-12-10T11:00:00.000Z');

async function setUp(
  start: string,
  end: string,
  options: {
    deposit?: number;
    status?: 'paid' | 'pending';
    depositStatus?: 'pending' | null;
  } = {},
) {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(owner.id, {
    deposit: options.deposit ?? 30,
  });
  const reservation = await createTestReservation(item.id, renter.id, {
    startDate: start,
    endDate: end,
    status: options.status ?? 'paid',
  });
  const payment = await prisma.payment.create({
    data: {
      reservationId: reservation.id,
      rentalAmount: 15,
      depositAmount: options.deposit ?? 30,
      status: 'paid',
      depositStatus:
        options.depositStatus === undefined ? 'pending' : options.depositStatus,
      rentalReference: 'pi_rent',
    },
  });
  return { renter, owner, payment };
}

beforeEach(async () => {
  await resetDb();
  authorizeDepositMock.mockReset();
  authorizeDepositMock.mockResolvedValue({ reference: 'pi_dep' });
  releaseMock.mockReset();
  releaseMock.mockResolvedValue(undefined);
  refundMock.mockReset();
  refundMock.mockResolvedValue(undefined);
});

describe('settleDueDeposits', () => {
  it('bloquea la fianza el día antes si el alquiler dura hasta 6 días', async () => {
    const { renter, payment } = await setUp('2026-12-11', '2026-12-16');

    await settleDueDeposits(renter.id, NOW);

    expect(authorizeDepositMock).toHaveBeenCalledWith('pi_rent', 3000, {
      capture: false,
    });
    const saved = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(saved.depositStatus).toBe('held');
    expect(saved.depositReference).toBe('pi_dep');
  });

  it('cobra la fianza si el alquiler dura más de 6 días', async () => {
    const { renter, payment } = await setUp('2026-12-11', '2026-12-17');

    await settleDueDeposits(renter.id, NOW);

    expect(authorizeDepositMock).toHaveBeenCalledWith('pi_rent', 3000, {
      capture: true,
    });
    const saved = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(saved.depositStatus).toBe('collected');
  });

  it('también la procesa el propietario al leer sus solicitudes', async () => {
    const { owner } = await setUp('2026-12-11', '2026-12-12');

    await settleDueDeposits(owner.id, NOW);

    expect(authorizeDepositMock).toHaveBeenCalledTimes(1);
  });

  it('no hace nada antes del día anterior al inicio', async () => {
    const { renter, payment } = await setUp('2026-12-12', '2026-12-13');

    await settleDueDeposits(renter.id, NOW);

    expect(authorizeDepositMock).not.toHaveBeenCalled();
    const saved = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(saved.depositStatus).toBe('pending');
  });

  it('no repite la operación una vez hecha', async () => {
    const { renter } = await setUp('2026-12-11', '2026-12-12');

    await settleDueDeposits(renter.id, NOW);
    await settleDueDeposits(renter.id, NOW);

    expect(authorizeDepositMock).toHaveBeenCalledTimes(1);
  });

  it('sin fianza (menos de 0,50 €) no hay pago de fianza', async () => {
    const { renter } = await setUp('2026-12-11', '2026-12-12', {
      deposit: 0.4,
      depositStatus: null,
    });

    await settleDueDeposits(renter.id, NOW);

    expect(authorizeDepositMock).not.toHaveBeenCalled();
  });

  it('ignora las reservas que no están pagadas', async () => {
    const { renter } = await setUp('2026-12-11', '2026-12-12', {
      status: 'pending',
    });

    await settleDueDeposits(renter.id, NOW);

    expect(authorizeDepositMock).not.toHaveBeenCalled();
  });

  it('si la pasarela falla, la fianza sigue pendiente y no lanza error', async () => {
    authorizeDepositMock.mockRejectedValue(new Error('tarjeta rechazada'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { renter, payment } = await setUp('2026-12-11', '2026-12-12');

    await expect(settleDueDeposits(renter.id, NOW)).resolves.toBeUndefined();

    const saved = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(saved.depositStatus).toBe('pending');
    expect(saved.depositReference).toBeNull();
    spy.mockRestore();
  });

  it('getMyReservations lo llama y no falla aunque la fianza falle', async () => {
    authorizeDepositMock.mockRejectedValue(new Error('x'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { renter } = await setUp('2026-12-11', '2026-12-12');
    // La fecha de hoy real es anterior a 2026-12-10: la reserva no vence aún, pero la lectura funciona.
    const result = await getMyReservations(renter.id);

    expect(result.sent).toHaveLength(1);
    spy.mockRestore();
  });

  // #365: si otra petición guarda la fianza (o se cancela la reserva) entre la llamada a Stripe y
  // el guardado, lo que se acaba de crear en Stripe no puede quedarse sin referencia en la BD.
  // Generado con asistencia de IA (Claude) – revisado por Alex Matos, 21/11/2026
  describe('si la fianza ya no está pendiente al guardarla (#365)', () => {
    // Como si otra lectura la hubiera guardado justo antes, con su propio bloqueo.
    function savedMeanwhile(paymentId: string, status: 'held' | 'collected') {
      authorizeDepositMock.mockImplementation(async () => {
        await prisma.payment.update({
          where: { id: paymentId },
          data: { depositStatus: status, depositReference: 'pi_dep_otro' },
        });
        return { reference: 'pi_dep_huerfano' };
      });
    }

    it('suelta el bloqueo que acaba de crear y deja el que ya estaba', async () => {
      const { renter, payment } = await setUp('2026-12-11', '2026-12-16');
      savedMeanwhile(payment.id, 'held');

      await settleDueDeposits(renter.id, NOW);

      expect(releaseMock).toHaveBeenCalledWith('pi_dep_huerfano');
      expect(refundMock).not.toHaveBeenCalled();
      const saved = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      expect(saved.depositStatus).toBe('held');
      expect(saved.depositReference).toBe('pi_dep_otro');
    });

    it('devuelve la fianza que acaba de cobrar en un alquiler de más de 6 días', async () => {
      const { renter, payment } = await setUp('2026-12-11', '2026-12-17');
      savedMeanwhile(payment.id, 'collected');

      await settleDueDeposits(renter.id, NOW);

      expect(refundMock).toHaveBeenCalledWith('pi_dep_huerfano');
      expect(releaseMock).not.toHaveBeenCalled();
    });

    it('si Stripe falla al soltarlo, no lanza y solo registra el mensaje', async () => {
      const { renter, payment } = await setUp('2026-12-11', '2026-12-16');
      savedMeanwhile(payment.id, 'held');
      releaseMock.mockRejectedValue(new Error('Stripe caído'));
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      await expect(settleDueDeposits(renter.id, NOW)).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledWith(expect.any(String), 'Stripe caído');
      spy.mockRestore();
    });

    it('con el propietario y el arrendatario leyendo a la vez, solo queda un bloqueo en Stripe', async () => {
      const { renter, owner, payment } = await setUp(
        '2026-12-11',
        '2026-12-16',
      );
      let calls = 0;
      authorizeDepositMock.mockImplementation(async () => ({
        reference: `pi_dep_${++calls}`,
      }));

      await Promise.all([
        settleDueDeposits(renter.id, NOW),
        settleDueDeposits(owner.id, NOW),
      ]);

      const saved = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      const created = authorizeDepositMock.mock.results.length;
      const released = releaseMock.mock.calls.map(([reference]) => reference);
      // Cada bloqueo creado está guardado o se ha soltado, nunca los dos ni ninguno.
      expect(released).not.toContain(saved.depositReference);
      expect(released).toHaveLength(created - 1);
    });
  });
});
