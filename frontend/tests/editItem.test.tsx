import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION_KEY = 'rentit.session';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const ITEM = {
  id: 'o1',
  title: 'Taladro percutor',
  description: 'Taladro con maletín y brocas.',
  dailyPrice: '5.50',
  deposit: '20.00',
  status: 'published',
};

const error = (field: string) => `El campo "${field}" no es correcto, revísalo.`;

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => handler(String(input), init));
}

// GET devuelve el objeto; el resto de peticiones las responde `onSave`.
function mockItemApi(onSave: Handler = () => Response.json(ITEM)) {
  return mockFetch((url, init) => {
    if (url.endsWith('/usuarios/me/objetos')) return Response.json([]);
    return init?.method === 'PATCH' ? onSave(url, init) : Response.json(ITEM);
  });
}

async function renderEdit() {
  const user = userEvent.setup();
  const view = renderRoute('/objetos/o1/editar');
  await screen.findByDisplayValue('Taladro percutor');
  return {
    user,
    ...view,
    title: screen.getByLabelText('Nombre'),
    description: screen.getByLabelText('Descripción'),
    dailyPrice: screen.getByLabelText('Precio por día (€)'),
    deposit: screen.getByLabelText('Fianza (€)'),
    save: screen.getByRole('button', { name: 'Guardar' }),
  };
}

beforeEach(() => localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION)));
afterEach(() => localStorage.clear());

describe('formulario de edición de un objeto (US-02.02, #109)', () => {
  it('sin sesión redirige al login', () => {
    localStorage.clear();
    const { router } = renderRoute('/objetos/o1/editar');

    expect(router.state.location.pathname).toBe('/login');
  });

  it('carga el objeto con el token y rellena el formulario', async () => {
    const fetchMock = mockItemApi();
    renderRoute('/objetos/o1/editar');

    expect(screen.getByRole('heading', { level: 1, name: 'Editar objeto' })).toBeInTheDocument();
    expect(screen.getByText('Cargando el objeto…')).toBeInTheDocument();

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Taladro percutor');
    expect(screen.getByLabelText('Descripción')).toHaveValue('Taladro con maletín y brocas.');
    expect(screen.getByLabelText('Precio por día (€)')).toHaveValue('5,50');
    expect(screen.getByLabelText('Fianza (€)')).toHaveValue('20,00');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/objetos/o1');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('al guardar envía los cambios y vuelve a «Mis objetos» con un aviso', async () => {
    const fetchMock = mockItemApi();
    const { user, router, title, dailyPrice, save } = await renderEdit();

    await user.clear(title);
    await user.type(title, '  Taladro Bosch  ');
    await user.clear(dailyPrice);
    await user.type(dailyPrice, '7,25');
    await user.click(save);

    await waitFor(() => expect(router.state.location.pathname).toBe('/mis-objetos'));
    expect(await screen.findByRole('status')).toHaveTextContent('Los cambios se han guardado.');

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe('http://localhost:3000/api/objetos/o1');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
      title: 'Taladro Bosch',
      description: 'Taladro con maletín y brocas.',
      dailyPrice: 7.25,
      deposit: 20,
    });
  });

  it.each([
    ['Nombre', '', 'nombre'],
    ['Nombre', 'a'.repeat(101), 'nombre'],
    ['Descripción', '   ', 'descripción'],
    ['Precio por día (€)', '0', 'precio por día'],
    ['Precio por día (€)', 'cinco', 'precio por día'],
    ['Precio por día (€)', '5,555', 'precio por día'],
    ['Fianza (€)', '-3', 'fianza'],
  ])('si «%s» vale «%s» muestra el error y no llama a la API', async (label, value, field) => {
    const fetchMock = mockItemApi();
    const { user, save } = await renderEdit();
    const input = screen.getByLabelText(label);

    await user.clear(input);
    if (value) await user.type(input, value);
    await user.click(save);

    expect(screen.getByText(error(field))).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('el error desaparece al corregir el campo', async () => {
    mockItemApi();
    const { user, title, save } = await renderEdit();

    await user.clear(title);
    await user.click(save);
    expect(screen.getByText(error('nombre'))).toBeInTheDocument();

    await user.type(title, 'Taladro');
    expect(screen.queryByText(error('nombre'))).not.toBeInTheDocument();
  });

  it('muestra en su campo el error que devuelve la API', async () => {
    mockItemApi(() =>
      Response.json({ error: 'Precio no válido', field: 'dailyPrice' }, { status: 400 }),
    );
    const { user, dailyPrice, save } = await renderEdit();

    await user.click(save);

    expect(await screen.findByText(error('precio por día'))).toBeInTheDocument();
    expect(dailyPrice).toHaveAttribute('aria-invalid', 'true');
    expect(save).toBeEnabled();
  });

  it('muestra un aviso general si la API falla sin indicar campo', async () => {
    mockItemApi(() => Response.json({ error: 'No puedes editar este objeto.' }, { status: 403 }));
    const { user, save } = await renderEdit();

    await user.click(save);

    expect(await screen.findByRole('alert')).toHaveTextContent('No puedes editar este objeto.');
  });

  it('si el objeto no existe muestra el error y un enlace a «Mis objetos»', async () => {
    mockFetch(() => Response.json({ error: 'Objeto no encontrado' }, { status: 404 }));
    renderRoute('/objetos/o1/editar');

    expect(await screen.findByRole('alert')).toHaveTextContent('Objeto no encontrado');
    expect(screen.getByRole('link', { name: 'Volver a Mis objetos' })).toHaveAttribute(
      'href',
      '/mis-objetos',
    );
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('si la sesión ya no es válida (401) la borra y vuelve al login', async () => {
    mockFetch(() =>
      Response.json(
        { error: 'Sesión no válida o caducada. Inicia sesión de nuevo.' },
        { status: 401 },
      ),
    );
    const { router } = renderRoute('/objetos/o1/editar');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('«Cancelar» vuelve a «Mis objetos» sin guardar', async () => {
    const fetchMock = mockItemApi();
    const { user, router } = await renderEdit();

    await user.click(screen.getByRole('link', { name: 'Cancelar' }));

    expect(router.state.location.pathname).toBe('/mis-objetos');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });
});
