// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCodeStore, hashToken, DEFAULT_TTL_MS } from './codes.mjs'

test('el token tiene 128 bits (22 caracteres base64url) y es distinto cada vez', () => {
  const store = createCodeStore()
  const a = store.createCode({ slot: 3 })
  const b = store.createCode({ slot: 3 })
  assert.match(a.token, /^[A-Za-z0-9_-]{22}$/)
  assert.notEqual(a.token, b.token)
})

test('solo se guarda el hash SHA-256, no el token', () => {
  const store = createCodeStore()
  const { token } = store.createCode({ slot: 3 })
  assert.deepEqual(store._rawKeys(), [hashToken(token)])
  assert.ok(!store._rawKeys().includes(token))
  assert.match(hashToken(token), /^[0-9a-f]{64}$/)
})

test('un código se puede usar una sola vez', () => {
  const store = createCodeStore()
  const { token } = store.createCode({ slot: 3, now: 1000 })
  assert.deepEqual(store.consumeCode(token, 2000), { status: 'abierta', slot: 3, usedAt: 2000 })
  assert.equal(store.consumeCode(token, 3000).status, 'usada')
  assert.equal(store.consumeCode(token, 4000).status, 'usada')
})

test('caduca a las 24 h por defecto', () => {
  const store = createCodeStore()
  const { token, expiresAt } = store.createCode({ slot: 1, now: 0 })
  assert.equal(expiresAt, DEFAULT_TTL_MS)
  assert.equal(store.consumeCode(token, DEFAULT_TTL_MS).status, 'caducada')
})

test('justo antes de caducar todavía abre', () => {
  const store = createCodeStore()
  const { token } = store.createCode({ slot: 1, now: 0, ttlMs: 5000 })
  assert.equal(store.consumeCode(token, 4999).status, 'abierta')
})

test('un código caducado no se marca como usado', () => {
  const store = createCodeStore()
  const { token } = store.createCode({ slot: 1, now: 0, ttlMs: 10 })
  store.consumeCode(token, 20)
  assert.equal(store.summary(20)[0].estado, 'caducado')
  assert.equal(store.summary(20)[0].usedAt, null)
})

test('un código usado que además caducó sigue diciendo «usada»', () => {
  const store = createCodeStore()
  const { token } = store.createCode({ slot: 1, now: 0, ttlMs: 100 })
  store.consumeCode(token, 50)
  assert.equal(store.consumeCode(token, 500).status, 'usada')
})

test('tokens desconocidos o mal formados dan «invalida»', () => {
  const store = createCodeStore()
  for (const t of ['nope', '', undefined, null, 42, 'x'.repeat(100)]) {
    assert.equal(store.consumeCode(t).status, 'invalida')
  }
})

test('cada código abre su taquilla y no la de otro', () => {
  const store = createCodeStore()
  const a = store.createCode({ slot: 3 })
  const b = store.createCode({ slot: 7 })
  assert.equal(store.consumeCode(b.token).slot, 7)
  assert.equal(store.consumeCode(a.token).slot, 3)
})

test('el resumen no expone tokens ni hashes', () => {
  const store = createCodeStore()
  const { token } = store.createCode({ slot: 3 })
  const json = JSON.stringify(store.summary())
  assert.ok(!json.includes(token) && !json.includes(hashToken(token)))
})

test('peekCode no consume: se puede mirar varias veces y luego abrir', () => {
  const store = createCodeStore()
  const { token } = store.createCode({ slot: 3, now: 0 })
  assert.deepEqual(store.peekCode(token, 10), { status: 'vigente', slot: 3 })
  assert.deepEqual(store.peekCode(token, 20), { status: 'vigente', slot: 3 })
  assert.equal(store.summary(20)[0].estado, 'vigente')
  assert.equal(store.consumeCode(token, 30).status, 'abierta')
  assert.equal(store.peekCode(token, 40).status, 'usada')
})

test('peekCode distingue caducada e inválida', () => {
  const store = createCodeStore()
  const { token } = store.createCode({ slot: 3, now: 0, ttlMs: 10 })
  assert.equal(store.peekCode(token, 10).status, 'caducada')
  assert.equal(store.peekCode('inventado', 0).status, 'invalida')
  assert.equal(store.peekCode(undefined).status, 'invalida')
})
