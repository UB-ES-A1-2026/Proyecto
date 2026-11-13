// Generado con asistencia de IA (Claude)
import { apiRequest } from './apiClient';

// Motivos por los que un admin retira un objeto publicado (moderación del panel).
export type AdminWithdrawReason = 'scam' | 'prohibited' | 'misleading' | 'other';

export const WITHDRAW_REASONS: { value: AdminWithdrawReason; label: string; hint: string }[] = [
  { value: 'scam', label: 'Posible estafa', hint: 'Precio irreal, pide pagos fuera de Rentit…' },
  {
    value: 'prohibited',
    label: 'Objeto prohibido o peligroso',
    hint: 'Armas, sustancias, objetos robados…',
  },
  {
    value: 'misleading',
    label: 'Anuncio falso o engañoso',
    hint: 'Las fotos o la descripción no corresponden al objeto.',
  },
  { value: 'other', label: 'Otro motivo', hint: 'Explícalo en los detalles.' },
];

// POST /api/admin/objetos/:id/retirar con { reason, details }. Propuesta de contrato para el
// backend: retira el objeto aunque no sea del admin (lo deja como «withdrawn», no lo borra, para
// conservar el historial de reservas) y avisa al propietario con el motivo.
export function adminWithdrawItem(
  token: string,
  id: string,
  reason: AdminWithdrawReason,
  details: string,
): Promise<void> {
  return apiRequest<void>(`/admin/objetos/${encodeURIComponent(id)}/retirar`, {
    method: 'POST',
    token,
    body: details ? { reason, details } : { reason },
  });
}
