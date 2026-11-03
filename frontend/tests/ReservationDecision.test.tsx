import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReservationDecision } from '../src/components/ReservationDecision';
import { AuthProvider } from '../src/context/AuthContext';

const SESSION_KEY = 'rentit.session';
const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const DECIDED_RESERVATION = { id: 'r1', status: 'accepted' };

function renderDecision(
  status = 'pending',
  onDecided: (updated: typeof DECIDED_RESERVATION) => void = vi.fn(),
) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
  return render(
    <AuthProvider>
      <ReservationDecision reservationId="r1" status={status} onDecided={onDecided} />
    </AuthProvider>,
  );
}

function mockFetch(handler: () => Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => handler());
}

afterEach(() => localStorage.clear());

describe('ReservationDecision', () => {
  it('muestra las dos acciones solo para una solicitud pendiente', () => {
    const { rerender } = renderDecision();

    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();

    rerender(
      <AuthProvider>
        <ReservationDecision reservationId="r1" status="accepted" onDecided={vi.fn()} />
      </AuthProvider>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(['accepted', 'rejected'])('no muestra acciones con estado %s', (status) => {
    renderDecision(status);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('acepta la solicitud, envía el token y notifica el resultado', async () => {
    const result = { id: 'r1', status: 'accepted' };
    const fetchMock = mockFetch(() => Response.json(result));
    const onDecided = vi.fn();
    const user = userEvent.setup();
    renderDecision('pending', onDecided);

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Has aceptado la solicitud.');
    expect(onDecided).toHaveBeenCalledWith(result);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/reservas/r1/aceptar',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer token-de-prueba',
    );
  });

  it('rechaza la solicitud', async () => {
    const result = { id: 'r1', status: 'rejected' };
    const fetchMock = mockFetch(() => Response.json(result));
    const onDecided = vi.fn();
    const user = userEvent.setup();
    renderDecision('pending', onDecided);

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Has rechazado la solicitud.');
    expect(onDecided).toHaveBeenCalledWith(result);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/reservas/r1/rechazar',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer token-de-prueba',
    );
  });

  it('desactiva las dos acciones mientras espera la respuesta', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    renderDecision();

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(screen.getByRole('button', { name: 'Aceptando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled();

    resolveResponse?.(Response.json(DECIDED_RESERVATION));
    await screen.findByRole('status');
  });

  it('muestra el error 409 y quita las acciones', async () => {
    mockFetch(() =>
      Response.json({ error: 'Esta solicitud ya no está pendiente.' }, { status: 409 }),
    );
    const user = userEvent.setup();
    renderDecision();

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta solicitud ya no está pendiente.',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([403, 404])('muestra el error %s y quita las acciones', async (status) => {
    mockFetch(() => Response.json({ error: `Error ${status}` }, { status }));
    const user = userEvent.setup();
    renderDecision();

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(`Error ${status}`);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('permite reintentar tras un error de conexión', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(DECIDED_RESERVATION));
    const user = userEvent.setup();
    renderDecision();

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede conectar con el servidor. Inténtalo más tarde.',
    );
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Has aceptado la solicitud.');
  });

  it('borra la sesión y oculta el componente ante un 401', async () => {
    mockFetch(() =>
      Response.json({ error: 'Sesión no válida.' }, { status: 401 }),
    );
    const user = userEvent.setup();
    renderDecision();

    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).toBeNull());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
