// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import { describe, expect, it, vi } from 'vitest';
import {
  createRealtimeBus,
  MAX_STREAMS_PER_USER,
  type RealtimeMessage,
} from '../../src/services/realtimeService.js';

function collect() {
  const received: RealtimeMessage[] = [];
  return {
    received,
    listener: (message: RealtimeMessage) => received.push(message),
  };
}

describe('realtimeService', () => {
  it('delivers an event only to the users it is addressed to', () => {
    const bus = createRealtimeBus();
    const ana = collect();
    const bea = collect();
    bus.subscribe('ana', 's1', ana.listener);
    bus.subscribe('bea', 's2', bea.listener);

    bus.publish(['ana'], 'entrega.estado', {
      reservationId: 'r1',
      status: 'recogida',
    });

    expect(ana.received).toHaveLength(1);
    expect(ana.received[0]).toMatchObject({
      type: 'entrega.estado',
      data: { reservationId: 'r1', status: 'recogida' },
    });
    expect(bea.received).toHaveLength(0);
  });

  it('delivers to every stream of the same user and ignores duplicated ids', () => {
    const bus = createRealtimeBus();
    const a = collect();
    const b = collect();
    bus.subscribe('ana', 's1', a.listener);
    bus.subscribe('ana', 's2', b.listener);

    bus.publish(['ana', 'ana'], 'entrega.estado', {});

    expect(a.received).toHaveLength(1);
    expect(b.received).toHaveLength(1);
  });

  it('uses ids <bootId>-<sequence> in publication order', () => {
    const bus = createRealtimeBus({ bootId: 'abc' });
    const ana = collect();
    bus.subscribe('ana', 's1', ana.listener);

    bus.publish(['ana'], 'entrega.estado', { n: 1 });
    bus.publish(['ana'], 'entrega.estado', { n: 2 });

    expect(ana.received.map((message) => message.id)).toEqual([
      'abc-1',
      'abc-2',
    ]);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createRealtimeBus();
    const ana = collect();
    const unsubscribe = bus.subscribe('ana', 's1', ana.listener);

    unsubscribe();
    bus.publish(['ana'], 'entrega.estado', {});

    expect(ana.received).toHaveLength(0);
    expect(bus.subscriberCount()).toBe(0);
  });

  describe('replay with lastEventId', () => {
    it('replays only the missed events of that user, in order', () => {
      const bus = createRealtimeBus({ bootId: 'abc' });
      bus.publish(['ana'], 'entrega.estado', { n: 1 });
      bus.publish(['bea'], 'entrega.estado', { n: 2 });
      bus.publish(['ana'], 'entrega.estado', { n: 3 });
      bus.publish(['ana'], 'entrega.estado', { n: 4 });
      const ana = collect();

      bus.subscribe('ana', 's1', ana.listener, 'abc-1');

      expect(ana.received.map((message) => message.id)).toEqual([
        'abc-3',
        'abc-4',
      ]);
    });

    it('replays nothing when the client is up to date', () => {
      const bus = createRealtimeBus({ bootId: 'abc' });
      bus.publish(['ana'], 'entrega.estado', {});
      const ana = collect();

      bus.subscribe('ana', 's1', ana.listener, 'abc-1');

      expect(ana.received).toEqual([]);
    });

    it('then keeps receiving live events', () => {
      const bus = createRealtimeBus({ bootId: 'abc' });
      bus.publish(['ana'], 'entrega.estado', {});
      const ana = collect();
      bus.subscribe('ana', 's1', ana.listener, 'abc-0');

      bus.publish(['ana'], 'entrega.estado', {});

      expect(ana.received.map((message) => message.id)).toEqual([
        'abc-1',
        'abc-2',
      ]);
    });

    it.each([
      ['an id from another boot', 'otro-3'],
      ['a malformed id', 'basura'],
      ['an id from the future', 'abc-99'],
    ])('emits resync for %s', (_name, lastEventId) => {
      const bus = createRealtimeBus({ bootId: 'abc' });
      bus.publish(['ana'], 'entrega.estado', {});
      const ana = collect();

      bus.subscribe('ana', 's1', ana.listener, lastEventId);

      expect(ana.received).toHaveLength(1);
      expect(ana.received[0]).toMatchObject({ type: 'resync', id: 'abc-1' });
    });

    it('emits resync when the id has already left the buffer, and keeps only the last events', () => {
      const bus = createRealtimeBus({ bootId: 'abc', bufferSize: 3 });
      for (let n = 1; n <= 5; n += 1)
        bus.publish(['ana'], 'entrega.estado', { n });

      const old = collect();
      bus.subscribe('ana', 's1', old.listener, 'abc-1');
      expect(old.received.map((message) => message.type)).toEqual(['resync']);

      const edge = collect();
      bus.subscribe('ana', 's2', edge.listener, 'abc-2');
      expect(edge.received.map((message) => message.id)).toEqual([
        'abc-3',
        'abc-4',
        'abc-5',
      ]);
    });
  });

  it('closeSession closes only the streams of that session', () => {
    const bus = createRealtimeBus();
    const closed = vi.fn();
    const other = vi.fn();
    const ana = collect();
    bus.subscribe('ana', 's1', ana.listener, undefined, closed);
    bus.subscribe('ana', 's2', collect().listener, undefined, other);

    bus.closeSession('s1');
    bus.publish(['ana'], 'entrega.estado', {});

    expect(closed).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(ana.received).toHaveLength(0);
    expect(bus.subscriberCount()).toBe(1);
  });

  it('closeAll closes every stream', () => {
    const bus = createRealtimeBus();
    const closed = vi.fn();
    bus.subscribe('ana', 's1', collect().listener, undefined, closed);
    bus.subscribe('bea', 's2', collect().listener, undefined, closed);

    bus.closeAll();

    expect(closed).toHaveBeenCalledTimes(2);
    expect(bus.subscriberCount()).toBe(0);
  });

  // Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
  it('closes the oldest stream of a user when a new one exceeds the cap', () => {
    const bus = createRealtimeBus();
    const closed = Array.from({ length: MAX_STREAMS_PER_USER + 1 }, () =>
      vi.fn(),
    );
    const bea = vi.fn();
    bus.subscribe('bea', 'sb', collect().listener, undefined, bea);
    closed.slice(0, MAX_STREAMS_PER_USER).forEach((onClose, index) => {
      bus.subscribe('ana', `s${index}`, collect().listener, undefined, onClose);
    });
    expect(closed[0]).not.toHaveBeenCalled();

    const newest = collect();
    bus.subscribe('ana', 'new', newest.listener, undefined, closed[5]);

    expect(closed[0]).toHaveBeenCalledTimes(1);
    closed
      .slice(1)
      .forEach((onClose) => expect(onClose).not.toHaveBeenCalled());
    expect(bea).not.toHaveBeenCalled();
    expect(bus.subscriberCount()).toBe(MAX_STREAMS_PER_USER + 1);
    bus.publish(['ana'], 'entrega.estado', {});
    expect(newest.received).toHaveLength(1);
  });

  it('a failing listener does not break the others', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = createRealtimeBus();
    const ana = collect();
    bus.subscribe('ana', 's1', () => {
      throw new Error('boom');
    });
    bus.subscribe('ana', 's2', ana.listener);

    expect(() => bus.publish(['ana'], 'entrega.estado', {})).not.toThrow();
    expect(ana.received).toHaveLength(1);
  });
});
