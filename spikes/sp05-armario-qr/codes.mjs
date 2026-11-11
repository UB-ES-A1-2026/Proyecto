// Lógica de los códigos de un solo uso de la taquilla (SP-05, #94).
// Solo se guarda el hash SHA-256 del token, nunca el token (como las sesiones, AGENTS.md).
// El almacén es un Map en memoria; en producción sería una tabla y `consumeCode`
// un único UPDATE condicionado (ver ADR 0006).
import { createHash, randomBytes } from 'node:crypto'

export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function createCodeStore() {
  /** @type {Map<string, {slot: number, createdAt: number, expiresAt: number, usedAt: number | null}>} */
  const byHash = new Map()

  return {
    /** Crea un código: 128 bits aleatorios en base64url. Devuelve el token (única vez que existe). */
    createCode({ slot, now = Date.now(), ttlMs = DEFAULT_TTL_MS }) {
      const token = randomBytes(16).toString('base64url')
      byHash.set(hashToken(token), { slot, createdAt: now, expiresAt: now + ttlMs, usedAt: null })
      return { token, slot, expiresAt: now + ttlMs }
    },

    /**
     * Consume un código. Es síncrono, así que en Node es atómico (no hay await entre
     * comprobar y marcar). Estados: abierta | usada | caducada | invalida.
     */
    consumeCode(token, now = Date.now()) {
      if (typeof token !== 'string' || token.length === 0 || token.length > 64) {
        return { status: 'invalida' }
      }
      const entry = byHash.get(hashToken(token))
      if (!entry) return { status: 'invalida' }
      if (entry.usedAt !== null) return { status: 'usada', slot: entry.slot, usedAt: entry.usedAt }
      if (now >= entry.expiresAt) return { status: 'caducada', slot: entry.slot }
      entry.usedAt = now
      return { status: 'abierta', slot: entry.slot, usedAt: now }
    },

    /** Para la pantalla de la taquilla: estado de los códigos, sin tokens ni hashes. */
    summary(now = Date.now()) {
      return [...byHash.values()].map((e) => ({
        slot: e.slot,
        estado: e.usedAt !== null ? 'usado' : now >= e.expiresAt ? 'caducado' : 'vigente',
        usedAt: e.usedAt,
        expiresAt: e.expiresAt,
      }))
    },

    /** Solo para los tests: lo guardado nunca debe contener el token. */
    _rawKeys: () => [...byHash.keys()],
  }
}
