// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { createEventStreamHandler } from '../../src/controllers/eventController.js';
import { requireAuth } from '../../src/middlewares/requireAuth.js';
import { prisma } from '../../src/repositories/prisma.js';
import { errorMiddleware } from '../../src/middlewares/errorMiddleware.js';
import { createSession, hashToken } from '../../src/services/sessionService.js';
import {
  closeAll,
  publish,
  subscriberCount,
} from '../../src/services/realtimeService.js';
import { resetDb } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

const servers: Server[] = [];
const controllers: AbortController[] = [];

function listen(target: express.Express): Promise<string> {
  return new Promise((resolve) => {
    const server = target.listen(0, '127.0.0.1', () => {
      servers.push(server);
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

// Lector mínimo de un stream SSE: acumula el texto y deja esperar a que aparezca algo.
async function openStream(
  baseUrl: string,
  token: string | null,
  headers: Record<string, string> = {},
  path = '/api/eventos/stream',
) {
  const controller = new AbortController();
  controllers.push(controller);
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}`, ...headers } : headers,
    signal: controller.signal,
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let done = false;

  const pump = (async () => {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value);
      }
    } catch {
      // abortado por el test
    }
    done = true;
  })();

  async function waitFor(predicate: (text: string) => boolean, ms = 2000) {
    const deadline = Date.now() + ms;
    while (!predicate(text)) {
      if (Date.now() > deadline) {
        throw new Error(
          `Tiempo agotado esperando al stream. Recibido: ${text}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  return {
    response,
    text: () => text,
    isDone: () => done,
    waitFor,
    waitForEnd: () => waitFor(() => done),
    close: () => controller.abort(),
    pump,
  };
}

async function sessionFor(username: string) {
  const user = await createTestUser({
    username,
    email: `${username}@rentit.test`,
  });
  const { token } = await createSession(user.id);
  return { user, token };
}

let baseUrl: string;

beforeEach(async () => {
  await resetDb();
  baseUrl = await listen(app);
});

afterEach(async () => {
  closeAll();
  for (const controller of controllers.splice(0)) controller.abort();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});

describe('GET /api/eventos/stream', () => {
  it('returns 401 without a token', async () => {
    const response = await fetch(`${baseUrl}/api/eventos/stream`);

    expect(response.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const response = await fetch(`${baseUrl}/api/eventos/stream`, {
      headers: { Authorization: 'Bearer nope' },
    });

    expect(response.status).toBe(401);
  });

  it('opens an SSE stream with the right headers and retry', async () => {
    const { token } = await sessionFor('ana');

    const stream = await openStream(baseUrl, token);
    await stream.waitFor((text) => text.includes('retry: 1000'));

    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get('content-type')).toContain(
      'text/event-stream',
    );
    expect(stream.response.headers.get('cache-control')).toBe(
      'no-cache, no-transform',
    );
    expect(stream.response.headers.get('x-accel-buffering')).toBe('no');
    expect(stream.response.headers.get('content-encoding')).toBeNull();
  });

  it('delivers events published to the user and not those for others', async () => {
    const ana = await sessionFor('ana');
    const bea = await sessionFor('bea');
    const anaStream = await openStream(baseUrl, ana.token);
    const beaStream = await openStream(baseUrl, bea.token);
    await anaStream.waitFor((text) => text.includes('retry:'));
    await beaStream.waitFor((text) => text.includes('retry:'));

    publish([bea.user.id], 'entrega.estado', { reservationId: 'solo-bea' });
    publish([ana.user.id], 'entrega.estado', {
      reservationId: 'r1',
      status: 'recogida',
    });

    await anaStream.waitFor((text) => text.includes('r1'));
    await beaStream.waitFor((text) => text.includes('solo-bea'));
    expect(anaStream.text()).toContain('event: entrega.estado');
    expect(anaStream.text()).toMatch(/id: [0-9a-f]+-\d+\n/);
    expect(anaStream.text()).not.toContain('solo-bea');
    expect(beaStream.text()).not.toContain('"r1"');
  });

  it('replays missed events when reconnecting with Last-Event-ID', async () => {
    const ana = await sessionFor('ana');
    const first = await openStream(baseUrl, ana.token);
    await first.waitFor((text) => text.includes('retry:'));
    publish([ana.user.id], 'entrega.estado', { n: 1 });
    await first.waitFor((text) => text.includes('"n":1'));
    const lastId = /id: (\S+)\n/.exec(first.text())![1];
    first.close();
    await first.pump;
    publish([ana.user.id], 'entrega.estado', { n: 2 });

    const second = await openStream(baseUrl, ana.token, {
      'Last-Event-ID': lastId,
    });
    await second.waitFor((text) => text.includes('"n":2'));

    expect(second.text()).not.toContain('"n":1');
  });

  // Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
  it('replays two or more missed events in order', async () => {
    const ana = await sessionFor('ana');
    const first = await openStream(baseUrl, ana.token);
    await first.waitFor((text) => text.includes('retry:'));
    publish([ana.user.id], 'entrega.estado', { n: 1 });
    await first.waitFor((text) => text.includes('"n":1'));
    const lastId = /id: (\S+)\n/.exec(first.text())![1];
    first.close();
    await first.pump;
    publish([ana.user.id], 'entrega.estado', { n: 2 });
    publish([ana.user.id], 'entrega.estado', { n: 3 });
    publish([ana.user.id], 'entrega.estado', { n: 4 });

    const second = await openStream(baseUrl, ana.token, {
      'Last-Event-ID': lastId,
    });
    await second.waitFor((text) => text.includes('"n":4'));

    const order = [...second.text().matchAll(/"n":(\d)/g)].map(
      (match) => match[1],
    );
    expect(order).toEqual(['2', '3', '4']);
  });

  it('does not open a subscription for HEAD requests', async () => {
    const { token } = await sessionFor('ana');

    const response = await fetch(`${baseUrl}/api/eventos/stream`, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(subscriberCount()).toBe(0);
  });

  it('closeAll ends an open HTTP stream', async () => {
    const { token } = await sessionFor('ana');
    const stream = await openStream(baseUrl, token);
    await stream.waitFor((text) => text.includes('retry:'));

    closeAll();

    await stream.waitForEnd();
    expect(stream.isDone()).toBe(true);
    expect(subscriberCount()).toBe(0);
  });

  it('sends resync when Last-Event-ID is from another boot', async () => {
    const ana = await sessionFor('ana');

    const stream = await openStream(baseUrl, ana.token, {
      'Last-Event-ID': 'otroarranque-7',
    });
    await stream.waitFor((text) => text.includes('event: resync'));
  });

  it('removes the subscription when the client disconnects', async () => {
    const ana = await sessionFor('ana');
    const stream = await openStream(baseUrl, ana.token);
    await stream.waitFor((text) => text.includes('retry:'));
    expect(subscriberCount()).toBe(1);

    stream.close();
    await stream.pump;
    const deadline = Date.now() + 2000;
    while (subscriberCount() > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(subscriberCount()).toBe(0);
  });
});

describe('logout', () => {
  it('closes the streams of the session that logs out and keeps the others', async () => {
    const ana = await sessionFor('ana');
    const other = await createSession(ana.user.id);
    const closing = await openStream(baseUrl, ana.token);
    const staying = await openStream(baseUrl, other.token);
    await closing.waitFor((text) => text.includes('retry:'));
    await staying.waitFor((text) => text.includes('retry:'));

    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ana.token}` },
    });

    expect(response.status).toBe(204);
    await closing.waitForEnd();
    expect(staying.isDone()).toBe(false);
  });
});

describe('stream timers (short intervals)', () => {
  async function shortApp() {
    const small = express();
    small.get(
      '/stream',
      requireAuth,
      createEventStreamHandler({ heartbeatMs: 30, sessionCheckMs: 50 }),
    );
    small.use(errorMiddleware);
    return listen(small);
  }

  it('sends a heartbeat comment periodically', async () => {
    const { token } = await sessionFor('ana');
    const url = await shortApp();

    const stream = await openStream(url, token, {}, '/stream');
    await stream.waitFor((text) => text.includes(': ping'));
  });

  it('closes the stream when the session is revoked behind its back', async () => {
    const { token } = await sessionFor('ana');
    const url = await shortApp();
    const stream = await openStream(url, token, {}, '/stream');
    await stream.waitFor((text) => text.includes('retry:'));

    await prisma.session.update({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });

    await stream.waitForEnd();
    expect(stream.isDone()).toBe(true);
  });

  it('keeps the stream open when the DB fails during the recheck, and still closes later', async () => {
    const { token } = await sessionFor('ana');
    const url = await shortApp();
    const stream = await openStream(url, token, {}, '/stream');
    await stream.waitFor((text) => text.includes('retry:'));

    const original = prisma.session.findUnique.bind(prisma.session);
    const failing = vi
      .spyOn(prisma.session, 'findUnique')
      .mockRejectedValue(new Error('BD caída'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(failing).toHaveBeenCalled();
    expect(stream.isDone()).toBe(false);

    // Se devuelve la implementación real (mockRestore deja el delegado de Prisma sin método).
    failing.mockImplementation(original);
    await prisma.session.update({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });
    await stream.waitForEnd();
  });

  it('keeps the stream open while the session is valid', async () => {
    const { token } = await sessionFor('ana');
    const url = await shortApp();
    const stream = await openStream(url, token, {}, '/stream');

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(stream.isDone()).toBe(false);
  });
});
