const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

// Formato de error de la API acordado en AGENTS.md: { error, field? }.
export class ApiError extends Error {
  readonly status: number;
  readonly field?: string;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = field;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
};

function isErrorBody(value: unknown): value is { error: string; field?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
  );
}

// Única puerta de salida hacia la API: los componentes usan los services, nunca fetch.
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'No se puede conectar con el servidor. Inténtalo más tarde.');
  }

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    if (isErrorBody(data)) throw new ApiError(response.status, data.error, data.field);
    throw new ApiError(response.status, 'Ha ocurrido un error inesperado.');
  }

  return data as T;
}
