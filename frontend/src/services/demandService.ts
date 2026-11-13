// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
import { apiRequest } from './apiClient';

// Respuesta de GET /api/objetos/:id/demanda (US-04.07, #311 y #312). Solo números y fechas: nunca
// quién ha hecho las solicitudes ni quién tiene las reservas.
export type ItemDemand = {
  // Días con alguna solicitud pendiente de otras personas. Los que no salen tienen 0.
  days: { date: string; pendingRequests: number }[];
  // Solicitudes distintas que tocan el rango pedido.
  pendingRequests: number;
  // Días ya ocupados por una reserva aceptada, pagada o en curso.
  bookedDays: string[];
};

export async function getItemDemand(
  token: string,
  itemId: string,
  from: string,
  to: string,
): Promise<ItemDemand> {
  const query = new URLSearchParams({ from, to }).toString();
  const demand = await apiRequest<Partial<ItemDemand>>(
    `/objetos/${encodeURIComponent(itemId)}/demanda?${query}`,
    { token },
  );
  return {
    days: Array.isArray(demand.days) ? demand.days : [],
    pendingRequests: typeof demand.pendingRequests === 'number' ? demand.pendingRequests : 0,
    bookedDays: Array.isArray(demand.bookedDays) ? demand.bookedDays : [],
  };
}
