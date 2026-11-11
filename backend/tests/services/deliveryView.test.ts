// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import type { ReservationStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  buildDeliveryView,
  type DeliveryViewInput,
} from '../../src/services/deliveryView.js';

// Reglas de privacidad de la entrega (US-05.01, #281).
const POINT = {
  id: 'p1',
  name: 'Biblioteca Jaume Fuster',
  address: 'Plaça de Lesseps, 20-22',
  neighborhood: 'Gràcia',
};

function input(overrides: Partial<DeliveryViewInput>): DeliveryViewInput {
  return {
    mode: 'home',
    status: 'pending',
    viewer: 'renter',
    slot: null,
    pickupPoint: null,
    fee: null,
    deliveryNeighborhood: null,
    deliveryAddress: null,
    ownerAddress: 'Carrer de Verdi, 45',
    ...overrides,
  };
}

const RIDER = {
  mode: 'rider' as const,
  slot: '11:00-13:00',
  fee: '5.00',
  deliveryNeighborhood: 'Poblenou',
  deliveryAddress: 'Carrer de Pallars, 120',
};

describe('buildDeliveryView', () => {
  it('returns null for a legacy reservation without delivery mode', () => {
    expect(buildDeliveryView(input({ mode: null }))).toBeNull();
  });

  describe('home pickup', () => {
    it.each(['accepted', 'paid', 'in_progress', 'finished'] as const)(
      'shows the owner address to the renter when the reservation is %s',
      (status) => {
        const view = buildDeliveryView(input({ status }));

        expect(view).toEqual({
          mode: 'home',
          slot: null,
          pickupPoint: null,
          fee: null,
          deliveryNeighborhood: null,
          deliveryAddress: null,
          ownerAddress: 'Carrer de Verdi, 45',
        });
      },
    );

    it.each(['pending', 'rejected', 'cancelled'] as const)(
      'hides the owner address from the renter when the reservation is %s',
      (status) => {
        expect(buildDeliveryView(input({ status }))?.ownerAddress).toBeNull();
      },
    );

    it('never shows the owner address to the owner', () => {
      const statuses: ReservationStatus[] = ['pending', 'accepted', 'paid'];
      for (const status of statuses) {
        const view = buildDeliveryView(input({ status, viewer: 'owner' }));
        expect(view?.ownerAddress).toBeNull();
      }
    });
  });

  describe('rider', () => {
    it('shows the renter everything about the delivery but not the owner address', () => {
      const view = buildDeliveryView(input({ ...RIDER, status: 'accepted' }));

      expect(view).toEqual({
        mode: 'rider',
        slot: '11:00-13:00',
        pickupPoint: null,
        fee: '5.00',
        deliveryNeighborhood: 'Poblenou',
        deliveryAddress: 'Carrer de Pallars, 120',
        ownerAddress: null,
      });
    });

    it('never gives the delivery address or the owner address to the owner', () => {
      const view = buildDeliveryView(
        input({ ...RIDER, status: 'accepted', viewer: 'owner' }),
      );

      expect(view).toEqual({
        mode: 'rider',
        slot: '11:00-13:00',
        pickupPoint: null,
        fee: '5.00',
        deliveryNeighborhood: 'Poblenou',
        deliveryAddress: null,
        ownerAddress: null,
      });
    });

    it('shows a missing slot as «asap»', () => {
      expect(buildDeliveryView(input({ ...RIDER, slot: null }))?.slot).toBe(
        'asap',
      );
    });
  });

  describe('pickup point', () => {
    it.each(['renter', 'owner'] as const)(
      'shows the public point to the %s and no addresses',
      (viewer) => {
        const view = buildDeliveryView(
          input({
            mode: 'pickup_point',
            status: 'paid',
            viewer,
            pickupPoint: POINT,
          }),
        );

        expect(view).toEqual({
          mode: 'pickup_point',
          slot: null,
          pickupPoint: POINT,
          fee: null,
          deliveryNeighborhood: null,
          deliveryAddress: null,
          ownerAddress: null,
        });
      },
    );
  });

  it('ignores fields that do not belong to the mode', () => {
    const view = buildDeliveryView(
      input({
        mode: 'home',
        ...{ slot: '09:00-11:00', fee: '3.00', pickupPoint: POINT },
        deliveryAddress: 'Carrer X',
        deliveryNeighborhood: 'Gràcia',
      }),
    );

    expect(view).toMatchObject({
      slot: null,
      fee: null,
      pickupPoint: null,
      deliveryAddress: null,
      deliveryNeighborhood: null,
    });
  });
});
