// Generado con asistencia de IA (Claude)
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceDelivery,
  confirmItemReceived,
  getDeliveryTracking,
  returnItem,
} from '../src/services/deliveryTrackingService';
import { tracking } from './trackingFixtures';

afterEach(() => vi.restoreAllMocks());

function mockFetch() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(tracking()));
}

describe('deliveryTrackingService (US-05.02, contrato de #288)', () => {
  it('pide el seguimiento de la reserva con el token', async () => {
    const fetchMock = mockFetch();

    await expect(getDeliveryTracking('token-de-prueba', 'r1')).resolves.toEqual(tracking());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/reservas/r1/entrega');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('el rider avanza al estado siguiente, sin código', async () => {
    const fetchMock = mockFetch();

    await advanceDelivery('token-de-prueba', 'r1', 'on_the_way');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/reservas/r1/entrega');
    expect(init?.method).toBe('PATCH');
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

  it('«Ya tengo el objeto» marca la entrega como entregada', async () => {
    const fetchMock = mockFetch();

    await confirmItemReceived('token-de-prueba', 'r1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/reservas/r1/entrega');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'delivered' });
  });

  it('«He devuelto el objeto» llama a la devolución sin cuerpo', async () => {
    const fetchMock = mockFetch();

    await returnItem('token-de-prueba', 'r 1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/reservas/r%201/devolucion');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
  });
});
