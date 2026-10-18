import { apiRequest } from './apiClient';

export type HealthResponse = { status: 'ok' };

export function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health');
}
