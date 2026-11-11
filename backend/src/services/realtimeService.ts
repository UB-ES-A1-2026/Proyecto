// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
// Bus de eventos en memoria para el tiempo real (ADR 0004). No conoce req ni res.
// Vale con una sola instancia del backend (Render gratuito); la BD sigue siendo la fuente de verdad
// y los eventos son solo avisos. Los services de dominio llaman a `publish` DESPUÉS de guardar.
import { randomBytes } from 'node:crypto';

// Se añadirán 'mensaje.nuevo' y 'notificacion.nueva' en S3.
export type RealtimeEventType = 'entrega.estado';

export interface RealtimeMessage {
  id: string;
  type: RealtimeEventType | 'resync';
  data: unknown;
}

export type RealtimeListener = (message: RealtimeMessage) => void;

interface BufferedEvent extends RealtimeMessage {
  seq: number;
  userIds: Set<string>;
}

interface Subscriber {
  userId: string;
  sessionId: string;
  listener: RealtimeListener;
  onClose?: () => void;
}

export const DEFAULT_BUFFER_SIZE = 500;

const EVENT_ID_PATTERN = /^(.+)-(\d+)$/;

export function createRealtimeBus(
  options: { bootId?: string; bufferSize?: number } = {},
) {
  // Cambia en cada arranque: un Last-Event-ID de otro arranque no se puede reenviar.
  const bootId = options.bootId ?? randomBytes(4).toString('hex');
  const bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;
  const buffer: BufferedEvent[] = [];
  const subscribers = new Set<Subscriber>();
  let sequence = 0;

  const eventId = (seq: number) => `${bootId}-${seq}`;

  function safeCall(listener: RealtimeListener, message: RealtimeMessage) {
    try {
      listener(message);
    } catch (error) {
      console.error('Error en un listener de tiempo real', error);
    }
  }

  function toMessage({ id, type, data }: BufferedEvent): RealtimeMessage {
    return { id, type, data };
  }

  // Avisa a los usuarios indicados. Quien llama decide los destinatarios (permisos en el servidor).
  function publish(
    userIds: string[],
    type: RealtimeEventType,
    data: unknown,
  ): void {
    sequence += 1;
    const event: BufferedEvent = {
      id: eventId(sequence),
      seq: sequence,
      type,
      data,
      userIds: new Set(userIds),
    };

    buffer.push(event);
    if (buffer.length > bufferSize) buffer.shift();

    for (const subscriber of [...subscribers]) {
      if (event.userIds.has(subscriber.userId)) {
        safeCall(subscriber.listener, toMessage(event));
      }
    }
  }

  // Reenvía lo perdido (mismo arranque y aún en el buffer) o pide recargar por REST con `resync`.
  function replay(
    userId: string,
    listener: RealtimeListener,
    lastEventId: string,
  ) {
    const match = EVENT_ID_PATTERN.exec(lastEventId);
    const lastSeq = match ? Number(match[2]) : NaN;
    const oldestSeq = buffer[0]?.seq ?? sequence + 1;

    if (
      !match ||
      match[1] !== bootId ||
      lastSeq > sequence ||
      lastSeq < oldestSeq - 1
    ) {
      safeCall(listener, {
        id: eventId(sequence),
        type: 'resync',
        data: { motivo: 'Eventos no disponibles: recarga por REST' },
      });
      return;
    }

    for (const event of buffer) {
      if (event.seq > lastSeq && event.userIds.has(userId)) {
        safeCall(listener, toMessage(event));
      }
    }
  }

  // Devuelve la función para darse de baja. `onClose` se llama si el bus cierra el stream
  // (logout o apagado); entonces el suscriptor ya está dado de baja.
  function subscribe(
    userId: string,
    sessionId: string,
    listener: RealtimeListener,
    lastEventId?: string,
    onClose?: () => void,
  ): () => void {
    if (lastEventId) replay(userId, listener, lastEventId);

    const subscriber: Subscriber = { userId, sessionId, listener, onClose };
    subscribers.add(subscriber);

    return () => {
      subscribers.delete(subscriber);
    };
  }

  function close(matches: (subscriber: Subscriber) => boolean) {
    for (const subscriber of [...subscribers]) {
      if (!matches(subscriber)) continue;
      subscribers.delete(subscriber);
      try {
        subscriber.onClose?.();
      } catch (error) {
        console.error('Error al cerrar un stream de tiempo real', error);
      }
    }
  }

  return {
    bootId,
    publish,
    subscribe,
    closeSession: (sessionId: string) =>
      close((subscriber) => subscriber.sessionId === sessionId),
    closeAll: () => close(() => true),
    subscriberCount: () => subscribers.size,
  };
}

// Instancia única del backend.
const bus = createRealtimeBus();

export const publish = bus.publish;
export const subscribe = bus.subscribe;
export const closeSession = bus.closeSession;
export const closeAll = bus.closeAll;
export const subscriberCount = bus.subscriberCount;
