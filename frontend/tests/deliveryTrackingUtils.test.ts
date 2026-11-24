// Generado con asistencia de IA (Claude)
import { describe, expect, it } from 'vitest';
import {
  buildSteps,
  describeMode,
  formatDateRange,
  formatDeliveryCode,
  formatStepTime,
  nextRiderStep,
} from '../src/utils/deliveryTracking';
import { pickupTracking, tracking } from './trackingFixtures';

function summary(steps: ReturnType<typeof buildSteps>) {
  return steps.map((step) => `${step.label}:${step.state}${step.at ? ':hora' : ''}`);
}

describe('buildSteps (US-05.02)', () => {
  it('con rider: los cuatro estados, con hora los alcanzados y el actual marcado', () => {
    expect(summary(buildSteps(tracking()))).toEqual([
      'Asignada:done:hora',
      'Recogida:done:hora',
      'En camino:current:hora',
      'Entregada:todo',
    ]);
  });

  it('con rider y sin rider asignado todavía, empieza en «Buscando rider»', () => {
    const steps = buildSteps(tracking({ deliveryStatus: 'pending', history: [] }));
    expect(summary(steps)).toEqual([
      'Buscando rider:current',
      'Asignada:todo',
      'Recogida:todo',
      'En camino:todo',
      'Entregada:todo',
    ]);
  });

  it('sin rider: «Pendiente de entrega» y «Entregada»', () => {
    expect(summary(buildSteps(pickupTracking()))).toEqual([
      'Pendiente de entrega:current:hora',
      'Entregada:todo',
    ]);
  });

  it('entregado sin rider: sigue con los estados del alquiler', () => {
    const steps = buildSteps(
      pickupTracking({
        deliveryStatus: 'delivered',
        reservationStatus: 'in_progress',
        history: [
          { status: 'delivered', at: '2026-11-25T08:15:00.000Z' },
          { status: 'in_progress', at: '2026-11-25T08:15:00.000Z' },
        ],
      }),
    );
    expect(summary(steps)).toEqual([
      'Entregada:done:hora',
      'En curso:current:hora',
      'Finalizada:todo',
    ]);
  });

  it('finalizado: todo hecho, también «Finalizada»', () => {
    const steps = buildSteps(
      tracking({
        deliveryStatus: 'delivered',
        reservationStatus: 'finished',
        deliveryCode: null,
        history: [
          ...tracking().history,
          { status: 'delivered', at: '2026-11-18T10:00:00.000Z' },
          { status: 'in_progress', at: '2026-11-18T10:00:00.000Z' },
          { status: 'finished', at: '2026-11-20T18:40:00.000Z' },
        ],
      }),
    );
    expect(steps.every((step) => step.state === 'done' && step.at)).toBe(true);
    expect(steps.map((step) => step.label)).toEqual([
      'Asignada',
      'Recogida',
      'En camino',
      'Entregada',
      'En curso',
      'Finalizada',
    ]);
  });
});

describe('utilidades del seguimiento', () => {
  it('el rider solo puede marcar el estado siguiente', () => {
    expect(nextRiderStep('assigned')).toBe('picked_up');
    expect(nextRiderStep('picked_up')).toBe('on_the_way');
    expect(nextRiderStep('on_the_way')).toBe('delivered');
    expect(nextRiderStep('delivered')).toBeNull();
    expect(nextRiderStep('pending')).toBeNull();
  });

  it('formatea la hora, el código y las fechas', () => {
    expect(formatStepTime('2026-11-18T09:02:00.000Z')).toMatch(/^18\/11\/2026, \d{2}:02$/);
    expect(formatDeliveryCode('482193')).toBe('482 193');
    expect(formatDeliveryCode('12')).toBe('12');
    expect(formatDateRange('2026-11-18', '2026-11-20')).toBe('18–20 nov. 2026');
    expect(formatDateRange('2026-11-18', '2026-11-18')).toBe('18 nov. 2026');
    expect(formatDateRange('2026-11-30', '2026-12-02')).toBe('30 nov. 2026–2 dic. 2026');
  });

  it('describe el modo de entrega', () => {
    expect(describeMode({ mode: 'rider', slot: null })).toBe(
      'Entrega por rider · Lo antes posible',
    );
    expect(describeMode({ mode: 'rider', slot: '10:00-12:00' })).toBe(
      'Entrega por rider · Franja 10:00–12:00',
    );
    expect(describeMode({ mode: 'home', slot: null })).toBe('Recoger en casa del propietario');
    expect(describeMode({ mode: 'pickup_point', slot: null })).toBe('Punto de recogida');
  });
});
