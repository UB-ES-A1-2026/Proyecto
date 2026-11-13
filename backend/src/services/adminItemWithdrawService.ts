// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 13/11/2026
// Retirada de objetos por un admin (US-11.03, #317). El contrato está en el issue.
import type { WithdrawalReason } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  itemExists,
  withdrawItemByAdmin,
} from '../repositories/adminItemWithdrawRepository.js';
import { ADMIN_ONLY_WITHDRAW_MESSAGE, assertAdmin } from './adminService.js';

export const ITEM_NOT_FOUND_MESSAGE = 'No hemos encontrado este objeto.';
export const ALREADY_WITHDRAWN_BY_ADMIN_MESSAGE =
  'Este objeto ya está retirado.';
export const INVALID_REASON_MESSAGE =
  'El campo "motivo" no es correcto, revísalo.';
export const INVALID_DETAILS_MESSAGE =
  'El campo "detalles" no es correcto, revísalo.';

export const WITHDRAWAL_DETAILS_MAX_LENGTH = 500;

const WITHDRAWAL_REASONS: readonly WithdrawalReason[] = [
  'scam',
  'prohibited',
  'misleading',
  'other',
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WithdrawalInput {
  reason: WithdrawalReason;
  details: string | null;
}

// Valida el cuerpo. Detalles: opcionales, recortados (en blanco = null) y obligatorios con «otro».
export function parseWithdrawalBody(body: unknown): WithdrawalInput {
  const fields =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const reason = WITHDRAWAL_REASONS.find((valid) => valid === fields.reason);
  if (!reason) {
    throw new AppError(400, INVALID_REASON_MESSAGE, 'reason');
  }

  const raw = fields.details;
  if (raw !== undefined && raw !== null && typeof raw !== 'string') {
    throw new AppError(400, INVALID_DETAILS_MESSAGE, 'details');
  }

  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (
    trimmed.length > WITHDRAWAL_DETAILS_MAX_LENGTH ||
    (reason === 'other' && trimmed === '')
  ) {
    throw new AppError(400, INVALID_DETAILS_MESSAGE, 'details');
  }

  return { reason, details: trimmed === '' ? null : trimmed };
}

export async function withdrawItemAsAdmin(
  adminId: string,
  itemId: string,
  body: unknown,
): Promise<void> {
  // El 403 va antes que cualquier validación.
  await assertAdmin(adminId, ADMIN_ONLY_WITHDRAW_MESSAGE);
  const input = parseWithdrawalBody(body);

  // Un id que no es un UUID no puede existir: 404 igual que un objeto que no existe.
  if (!UUID_PATTERN.test(itemId) || !(await itemExists(itemId))) {
    throw new AppError(404, ITEM_NOT_FOUND_MESSAGE);
  }

  const withdrawn = await withdrawItemByAdmin(itemId, {
    adminId,
    ...input,
  });
  if (!withdrawn) {
    throw new AppError(409, ALREADY_WITHDRAWN_BY_ADMIN_MESSAGE);
  }
}
