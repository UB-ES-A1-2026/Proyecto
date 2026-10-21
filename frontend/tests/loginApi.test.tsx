import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION_KEY = 'rentit.session';

const LOGIN_RESPONSE = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

function mockFetch(response: Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    // La home comprueba /health al cargar; aquí solo nos interesa el login.
    if (String(input).endsWith('/health')) return Response.json({ status: 'ok' });
    return response;
  });
}

async function submitLogin(email = 'ana@rentit.test', password = 'Rentit2026') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Correo electrónico'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

afterEach(() => localStorage.clear());

describe('login conectado con la API (US-01.2, #27)', () => {
  it('envía el correo sin espacios y la contraseña a POST /api/auth/login', async () => {
    const fetchMock = mockFetch(Response.json(LOGIN_RESPONSE));
    renderRoute('/login');

    await submitLogin('  ana@rentit.test ', 'Rentit2026');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/auth/login');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"email":"ana@rentit.test","password":"Rentit2026"}');
  });

  it('guarda la sesión y vuelve a la home si no venía de otra página', async () => {
    mockFetch(Response.json(LOGIN_RESPONSE));
    const { router } = renderRoute('/login');

    await submitLogin();

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')).toEqual(LOGIN_RESPONSE);
  });

  it('vuelve a la página en la que estaba el usuario', async () => {
    mockFetch(Response.json(LOGIN_RESPONSE));
    const { router } = renderRoute({ pathname: '/login', state: { from: '/perfil' } });

    await submitLogin();

    await waitFor(() => expect(router.state.location.pathname).toBe('/perfil'));
  });

  it('marca el campo que indica la API cuando las credenciales no son correctas', async () => {
    mockFetch(
      Response.json(
        { error: 'El campo "contraseña" no es correcto, revísalo.', field: 'password' },
        { status: 401 },
      ),
    );
    const { router } = renderRoute('/login');

    await submitLogin('ana@rentit.test', 'incorrecta');

    expect(
      await screen.findByText('El campo "contraseña" no es correcto, revísalo.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(router.state.location.pathname).toBe('/login');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('muestra un aviso general si la cuenta está bloqueada', async () => {
    mockFetch(
      Response.json(
        { error: 'Tu cuenta está bloqueada. Contacta con el administrador.' },
        { status: 403 },
      ),
    );
    renderRoute('/login');

    await submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu cuenta está bloqueada. Contacta con el administrador.',
    );
  });

  it('muestra un aviso general si no hay conexión con el servidor', async () => {
    // El rechazo se crea al llamar a fetch; creado antes, Node lo trata como no gestionado.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    renderRoute('/login');

    await submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede conectar con el servidor. Inténtalo más tarde.',
    );
  });

  it('desactiva el botón mientras espera la respuesta', async () => {
    let resolveLogin: (response: Response) => void = () => {};
    mockFetch(new Promise<Response>((resolve) => (resolveLogin = resolve)));
    renderRoute('/login');

    await submitLogin();

    expect(screen.getByRole('button', { name: 'Iniciando sesión…' })).toBeDisabled();
    resolveLogin(Response.json(LOGIN_RESPONSE));
    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).not.toBeNull());
  });
});
