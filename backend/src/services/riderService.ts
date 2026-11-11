// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import type { RiderBody } from '../controllers/riderBody.js';
import { AppError } from '../errors/appError.js';
import {
  createRiderAccount,
  findRiderFlags,
} from '../repositories/riderRepository.js';
import {
  findUserByEmail,
  findUserByUsername,
} from '../repositories/userRepository.js';
import {
  REGISTER_USERNAME_TAKEN_MESSAGE,
  uniqueConstraintField,
} from './authService.js';

export const RIDER_EMAIL_TAKEN_MESSAGE =
  'Ya existe una cuenta con este correo.';
export const RIDER_ACCOUNT_NOT_ALLOWED_MESSAGE =
  'Las cuentas de rider no pueden solicitar ni publicar objetos.';
export const RIDER_APPLICATION_RECEIVED_MESSAGE =
  'Hemos recibido tu solicitud. Un admin la revisará pronto.';

export type RiderStatus = 'pending' | 'approved' | 'rejected';

function throwConflict(field: 'email' | 'username'): never {
  if (field === 'email') {
    throw new AppError(409, RIDER_EMAIL_TAKEN_MESSAGE, 'email');
  }
  throw new AppError(409, REGISTER_USERNAME_TAKEN_MESSAGE, 'username');
}

// Alta de una cuenta de rider con su solicitud (US-10.03). No crea sesión: la persona inicia
// sesión después y ve el estado de su solicitud.
export async function registerRider(
  input: RiderBody,
): Promise<{ message: string; status: RiderStatus }> {
  if (await findUserByEmail(input.email)) throwConflict('email');
  if (await findUserByUsername(input.username)) throwConflict('username');

  const { password, ...data } = input;
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  try {
    await createRiderAccount({ ...data, passwordHash });
  } catch (error) {
    // Dos altas simultáneas pueden pasar las comprobaciones de arriba: la BD las desempata.
    const field = uniqueConstraintField(error);
    if (field) throwConflict(field);
    throw error;
  }

  return { message: RIDER_APPLICATION_RECEIVED_MESSAGE, status: 'pending' };
}

// Una cuenta de rider (con cualquier estado de solicitud) no puede solicitar ni publicar objetos.
export async function assertNotRiderAccount(userId: string): Promise<void> {
  const flags = await findRiderFlags(userId);

  if (flags?.isRider) {
    throw new AppError(403, RIDER_ACCOUNT_NOT_ALLOWED_MESSAGE);
  }
}

// Solo un rider aprobado por un admin puede repartir (US-10.01, US-11.03).
export async function isApprovedRider(userId: string): Promise<boolean> {
  const flags = await findRiderFlags(userId);

  return flags?.isRider === true && flags.status === 'approved';
}
