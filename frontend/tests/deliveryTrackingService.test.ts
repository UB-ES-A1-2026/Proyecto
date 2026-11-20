// Generado con asistencia de IA (Claude)
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceDelivery,
  confirmItemReceived,
  getDeliveryTracking,
  requestNewDeliveryCode,
  returnItem,
  toDeliveryTracking,
} from '../src/services/deliveryTrackingService';
import { apiTracking, pickupTracking, tracking } from './trackingFixtures';

afterEach(() => vi.restoreAllMocks());

function mockFetch() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(apiTracking(tracking())));
}

describe('deliveryTrackingService (US-05.02, API de T13 #288)', () => {
  it('pide el seguimiento de la reserva con el token y lo pasa a la vista', async () => {
    const fetchMock = mockFetch();

    await expect(getDeliveryTracking('token-de-prueba', 'r1')).resolves.toEqual(tracking());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/entregas/r1');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('el rider avanza al estado siguiente, sin código', async () => {
    const fetchMock = mockFetch();

    await advanceDelivery('token-de-prueba', 'r1', 'on_the_way');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/entregas/r1/estado');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'on_the_way' });
  });

  it('para «Entregada» el rider manda el código', async () => {
    const fetchMock = mockFetch();

    await advanceDelivery('token-de-prueba', 'r1', 'delivered', '482193');

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      status: 'delivered',
      code: '482193',
    });
  });

  it('«Ya tengo el objeto» es un POST a «recibida» sin cuerpo', async () => {
    const fetchMock = mockFetch();

    await confirmItemReceived('token-de-prueba', 'r1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/entregas/r1/recibida');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
  });

  it('«He devuelto el objeto» es un POST a «devuelta» sin cuerpo', async () => {
    const fetchMock = mockFetch();

    await returnItem('token-de-prueba', 'r 1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/entregas/r%201/devuelta');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
  });

  it('el código nuevo es un POST a «codigo» sin cuerpo y devuelve el seguimiento', async () => {
    const fetchMock = mockFetch();

    const view = await requestNewDeliveryCode('token-de-prueba', 'r 1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/entregas/r%201/codigo');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
    expect(view.deliveryCode).toBe('482193');
  });
});

describe('toDeliveryTracking: de la respuesta de la API a la vista', () => {
  it('solo quedan los pasos con hora, y «asap» es «Lo antes posible»', () => {
    const view = toDeliveryTracking(apiTracking(tracking()));

    expect(view.slot).toBeNull();
    expect(view.deliveryStatus).toBe('on_the_way');
    expect(view.history.map((entry) => entry.status)).toEqual([
      'assigned',
      'picked_up',
      'on_the_way',
    ]);
  });

  it('una franja llega tal cual', () => {
    const view = toDeliveryTracking(apiTracking(tracking({ slot: '10:00-12:00' })));

    expect(view.slot).toBe('10:00-12:00');
  });

  it('al entregar empieza «En curso», y al devolver, «Finalizada»', () => {
    const delivered = '2026-11-25T08:15:00.000Z';
    const returned = '2026-11-26T18:40:00.000Z';
    const view = toDeliveryTracking(
      apiTracking(
        pickupTracking({
          deliveryStatus: 'delivered',
          reservationStatus: 'finished',
          history: [
            { status: 'delivered', at: delivered },
            { status: 'finished', at: returned },
          ],
        }),
      ),
    );

    expect(view.history).toEqual([
      { status: 'delivered', at: delivered },
      { status: 'in_progress', at: delivered },
      { status: 'finished', at: returned },
    ]);
  });
});
