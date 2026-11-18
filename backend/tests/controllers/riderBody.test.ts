// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import { describe, expect, it } from 'vitest';
import { readRiderBody } from '../../src/controllers/riderBody.js';

const valid = {
  username: 'carla',
  email: 'Carla@Rentit.test',
  password: 'contraseña-segura',
  phone: '612 34 56 78',
  zone: ' Gràcia ',
  vehicle: 'bike',
  days: ['monday', 'saturday'],
  slots: ['morning', 'night'],
  acceptedTerms: true,
};

function errorOf(body: unknown) {
  try {
    readRiderBody(body);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('readRiderBody', () => {
  it('normalizes a valid body', () => {
    expect(readRiderBody(valid)).toEqual({
      username: 'carla',
      email: 'carla@rentit.test',
      password: 'contraseña-segura',
      phone: '612345678',
      zone: 'Gràcia',
      vehicle: 'bike',
      days: ['monday', 'saturday'],
      slots: ['morning', 'night'],
    });
  });

  it.each([
    ['612345678', '612345678'],
    ['+34 612 345 678', '612345678'],
    ['0034612345678', '612345678'],
    ['  912 34 56 78 ', '912345678'],
  ])('accepts the phone %s', (phone, expected) => {
    expect(readRiderBody({ ...valid, phone }).phone).toBe(expected);
  });

  it.each([
    [{ ...valid, username: 'ab' }, 'username'],
    [{ ...valid, email: 'no-es-correo' }, 'email'],
    [{ ...valid, password: '1234567' }, 'password'],
    [{ ...valid, phone: '12345678' }, 'phone'],
    [{ ...valid, phone: '+44612345678' }, 'phone'],
    [{ ...valid, phone: '61234567a' }, 'phone'],
    [{ ...valid, phone: 612345678 }, 'phone'],
    [{ ...valid, phone: undefined }, 'phone'],
    [{ ...valid, zone: ' a ' }, 'zone'],
    [{ ...valid, zone: 'a'.repeat(101) }, 'zone'],
    [{ ...valid, zone: 5 }, 'zone'],
    [{ ...valid, vehicle: 'coche' }, 'vehicle'],
    [{ ...valid, vehicle: undefined }, 'vehicle'],
    [{ ...valid, days: [] }, 'days'],
    [{ ...valid, days: 'monday' }, 'days'],
    [{ ...valid, days: ['monday', 'monday'] }, 'days'],
    [{ ...valid, days: ['lunes'] }, 'days'],
    [{ ...valid, slots: [] }, 'slots'],
    [{ ...valid, slots: ['morning', 'morning'] }, 'slots'],
    [{ ...valid, slots: ['manana'] }, 'slots'],
    [{ ...valid, acceptedTerms: false }, 'acceptedTerms'],
    [{ ...valid, acceptedTerms: 'true' }, 'acceptedTerms'],
    [{ ...valid, acceptedTerms: undefined }, 'acceptedTerms'],
    [null, 'username'],
  ])('rejects %j with a 400 on the field %s', (body, field) => {
    expect(errorOf(body)).toMatchObject({
      name: 'AppError',
      status: 400,
      field,
    });
  });

  it('uses the messages agreed for each field', () => {
    expect(errorOf({ ...valid, phone: '1' })).toMatchObject({
      message: 'El campo "teléfono" no es correcto, revísalo.',
    });
    expect(errorOf({ ...valid, zone: '' })).toMatchObject({
      message: 'El campo "zona" no es correcto, revísalo.',
    });
    expect(errorOf({ ...valid, acceptedTerms: false })).toMatchObject({
      message: 'Tienes que aceptar las condiciones.',
    });
  });

  it('reuses the registration messages for the account fields', () => {
    expect(errorOf({ ...valid, username: 'a' })).toMatchObject({
      message:
        'El campo "nombre de usuario" no está correctamente introducido, prueba a revisarlo.',
    });
  });
});
