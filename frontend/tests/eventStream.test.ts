// Generado con asistencia de IA (Claude)
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSseParser,
  openEventStream,
  type StreamEvent,
} from '../src/services/eventStreamService';
import { sseResponse } from './trackingFixtures';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createSseParser (canal de tiempo real, #289)', () => {
  it('junta los trozos, ignora los comentarios y lee el JSON de cada evento', () => {
    const events: StreamEvent[] = [];
    const parser = createSseParser((event) => events.push(event));

    parser.push('retry: 1000\n\n: ping\n\nid: b-1\nevent: entrega.es');
    parser.push('tado\ndata: {"reservationId":"r1","status":"on_the_way"}\n\n');
    parser.push('id: b-2\r\nevent: resync\r\ndata: {}\r\n\r\ndata: texto\n\n');

    expect(events).toEqual([
      {
        id: 'b-1',
        type: 'entrega.estado',
        data: { reservationId: 'r1', status: 'on_the_way' },
      },
      { id: 'b-2', type: 'resync', data: {} },
      { id: null, type: 'message', data: 'texto' },
    ]);
    expect(parser.retryMs).toBe(1000);
  });
});

describe('openEventStream', () => {
  it('abre el canal con el token en la cabecera y avisa de cada evento', async () => {
    const stream = sseResponse();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(stream.response);
    const onEvent = vi.fn();
    const onOpen = vi.fn();

    const close = openEventStream('token-de-prueba', { onEvent, onOpen });
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalled());
    stream.send('id: b-1\nevent: entrega.estado\ndata: {"reservationId":"r1"}\n\n');
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/eventos/stream');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-de-prueba');
    expect(headers.get('Accept')).toBe('text/event-stream');
    expect(onEvent).toHaveBeenCalledWith({
      id: 'b-1',
      type: 'entrega.estado',
      data: { reservationId: 'r1' },
    });
    close();
  });

  it('con un 401 avisa y no vuelve a intentarlo', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ error: 'Sesión no válida.' }, { status: 401 }));
    const onUnauthorized = vi.fn();
    const onFailure = vi.fn();

    const close = openEventStream('token-de-prueba', {
      onEvent: vi.fn(),
      onUnauthorized,
      onFailure,
    });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    close();
  });

  it('si se corta, reconecta con Last-Event-ID y cuenta los fallos seguidos', async () => {
    vi.useFakeTimers();
    const first = sseResponse();
    const second = sseResponse();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(first.response)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(second.response);
    const onFailure = vi.fn();
    const onOpen = vi.fn();

    const close = openEventStream('token-de-prueba', { onEvent: vi.fn(), onFailure, onOpen });
    await vi.advanceTimersByTimeAsync(0);
    first.send('id: b-7\nevent: entrega.estado\ndata: {}\n\n');
    first.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(onFailure).toHaveBeenLastCalledWith(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onFailure).toHaveBeenLastCalledWith(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get('Last-Event-ID')).toBe('b-7');
    close();
  });

  it('una respuesta que no es 200 cuenta como fallo; al cerrarlo ya no reconecta', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 503 }));
    const onFailure = vi.fn();

    const close = openEventStream('token-de-prueba', { onEvent: vi.fn(), onFailure });
    await vi.advanceTimersByTimeAsync(0);
    expect(onFailure).toHaveBeenCalledWith(1);

    close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
