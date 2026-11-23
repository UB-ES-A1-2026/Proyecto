// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventStreamHandler } from '../../src/controllers/eventController.js';
import {
  closeAll,
  publish,
  subscriberCount,
} from '../../src/services/realtimeService.js';

// Response mínimo: lo justo para ejercitar el handler sin abrir sockets reales.
function fakeResponse() {
  const response = {
    writableLength: 0,
    writableEnded: false,
    status: vi.fn(() => response),
    set: vi.fn(() => response),
    flushHeaders: vi.fn(),
    write: vi.fn(() => true),
    end: vi.fn(() => {
      response.writableEnded = true;
    }),
  };
  return response;
}

function fakeRequest() {
  return {
    method: 'GET',
    auth: { userId: 'ana', sessionId: 's1' },
    get: () => undefined,
    on: vi.fn(),
  };
}

afterEach(() => {
  closeAll();
});

describe('event stream backpressure', () => {
  it('closes the stream of a slow client whose socket buffer exceeds the limit', () => {
    const handler = createEventStreamHandler({
      maxBufferedBytes: 100,
      heartbeatMs: 60_000,
      sessionCheckMs: 60_000,
    });
    const response = fakeResponse();
    handler(
      fakeRequest() as unknown as Request,
      response as unknown as Response,
      vi.fn(),
    );
    expect(subscriberCount()).toBe(1);

    response.writableLength = 50;
    publish(['ana'], 'entrega.estado', { n: 1 });
    expect(response.end).not.toHaveBeenCalled();

    response.writableLength = 101;
    publish(['ana'], 'entrega.estado', { n: 2 });

    expect(response.end).toHaveBeenCalledTimes(1);
    expect(subscriberCount()).toBe(0);
  });
});
