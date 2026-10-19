import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION_KEY = 'rentit.session';

const REGISTER_RESPONSE = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const error = (field: string) =>
  `El campo "${field}" no está correctamente introducido, prueba a revisarlo.`;

function mockFetch(response: Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response);
}

async function submitRegister(
  username = 'ana',
  email = 'ana@rentit.test',
  password = 'Rentit2026',
) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Nombre de usuario'), username);
  await user.type(screen.getByLabelText('Correo electrónico'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

afterEach(() => localStorage.clear());

describe('registro conectado con la API (US-01.1, #24)', () => {
  it('envía los datos sin espacios a POST /api/auth/register', async () => {
    const fetchMock = mockFetch(Response.json(REGISTER_RESPONSE, { status: 201 }));
    renderRoute('/registro');

    await submitRegister('  ana ', ' ana@rentit.test ', 'Rentit2026');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/auth/register');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"username":"ana","email":"ana@rentit.test","password":"Rentit2026"}');
  });

  it('guarda la sesión y lleva a la página inicial con la cuenta creada', async () => {
    mockFetch(Response.json(REGISTER_RESPONSE, { status: 201 }));
    const { router } = renderRoute('/registro');

    await submitRegister();

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')).toEqual(REGISTER_RESPONSE);
    expect(await screen.findByText('Hola, ana')).toBeInTheDocument();
  });

  it('marca el correo si ya está registrado (409) y no crea la sesión', async () => {
    mockFetch(
      Response.json(
        { error: 'Ya existe una cuenta con este correo electrónico.', field: 'email' },
        { status: 409 },
      ),
    );
    const { router } = renderRoute('/registro');

    await submitRegister();

    expect(await screen.findByText(error('correo electrónico'))).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
    expect(router.state.location.pathname).toBe('/registro');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('marca el nombre de usuario si ya está en uso (409)', async () => {
    mockFetch(
      Response.json(
        { error: 'Este nombre de usuario ya está en uso.', field: 'username' },
        { status: 409 },
      ),
    );
    renderRoute('/registro');

    await submitRegister();

    expect(await screen.findByText(error('nombre de usuario'))).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de usuario')).toHaveAttribute('aria-invalid', 'true');
  });

  it('muestra un aviso general si no hay conexión con el servidor', async () => {
    mockFetch(Promise.reject(new TypeError('Failed to fetch')));
    renderRoute('/registro');

    await submitRegister();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede conectar con el servidor. Inténtalo más tarde.',
    );
  });

  it('desactiva el botón mientras espera la respuesta', async () => {
    let resolveRegister: (response: Response) => void = () => {};
    mockFetch(new Promise<Response>((resolve) => (resolveRegister = resolve)));
    renderRoute('/registro');

    await submitRegister();

    expect(screen.getByRole('button', { name: 'Creando cuenta…' })).toBeDisabled();
    resolveRegister(Response.json(REGISTER_RESPONSE, { status: 201 }));
    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).not.toBeNull());
  });
});
