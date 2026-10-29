import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION_KEY = 'rentit.session';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const LIST = [
  {
    id: 'o1',
    title: 'Taladro percutor',
    dailyPrice: '5.50',
    neighborhood: 'Gràcia',
    status: 'published',
  },
];

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

// La lista y el objeto responden bien; el PATCH lo responde `onSave` y el GET del objeto, `onLoad`.
function mockItemApi({
  onSave = () => Response.json(ITEM),
  onLoad = () => Response.json(ITEM),
}: { onSave?: Handler; onLoad?: Handler } = {}) {
  return mockFetch((url, init) => {
    if (url.endsWith('/usuarios/me/objetos')) return Response.json(LIST);
    return init?.method === 'PATCH' ? onSave(url, init) : onLoad(url, init);
  });
}

async function openEditor() {
  const user = userEvent.setup();
  const view = renderRoute('/mis-objetos');
  const editButton = await screen.findByRole('button', { name: 'Editar Taladro percutor' });
  await user.click(editButton);
  const dialog = await screen.findByRole('dialog', { name: 'Editar objeto' });
  return { user, view, editButton, dialog };
}

async function openForm() {
  const opened = await openEditor();
  const { dialog } = opened;
  await within(dialog).findByDisplayValue('Taladro percutor');
  return {
    ...opened,
    title: within(dialog).getByLabelText('Nombre'),
    dailyPrice: within(dialog).getByLabelText('Precio por día (€)'),
    save: within(dialog).getByRole('button', { name: 'Guardar' }),
  };
}

beforeEach(() => localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION)));
afterEach(() => localStorage.clear());

describe('ventana de edición de un objeto (US-02.02, #109)', () => {
  it('«Editar» abre la ventana, pide el objeto con el token y rellena el formulario', async () => {
    // El objeto no llega hasta que se llama a `respond`, para ver el estado de carga.
    let respond = () => {};
    const loaded = new Promise<void>((resolve) => (respond = resolve));
    const fetchMock = mockItemApi({ onLoad: () => loaded.then(() => Response.json(ITEM)) });
    const { dialog } = await openEditor();

    expect(within(dialog).getByText('Cargando el objeto…')).toBeInTheDocument();
    respond();
    expect(await within(dialog).findByLabelText('Nombre')).toHaveValue('Taladro percutor');
    expect(within(dialog).getByLabelText('Descripción')).toHaveValue(
      'Taladro con maletín y brocas.',
    );
    expect(within(dialog).getByLabelText('Precio por día (€)')).toHaveValue('5,50');
    expect(within(dialog).getByLabelText('Fianza (€)')).toHaveValue('20,00');

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('http://localhost:3000/api/objetos/o1');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('al guardar envía los cambios, cierra la ventana y actualiza la lista', async () => {
    const fetchMock = mockItemApi({
      onSave: () => Response.json({ ...ITEM, title: 'Taladro Bosch', dailyPrice: '7.25' }),
    });
    const { user, title, dailyPrice, save } = await openForm();

    await user.clear(title);
    await user.type(title, '  Taladro Bosch  ');
    await user.clear(dailyPrice);
    await user.type(dailyPrice, '7,25');
    await user.click(save);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Los cambios se han guardado.');
    expect(screen.getByRole('heading', { name: 'Taladro Bosch' })).toBeInTheDocument();
    expect(screen.getByText(/7,25\s€ \/ día/)).toBeInTheDocument();

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
    const { user, dialog, save } = await openForm();
    const input = within(dialog).getByLabelText(label);

    await user.clear(input);
    if (value) await user.type(input, value);
    await user.click(save);

    expect(within(dialog).getByText(error(field))).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('el error desaparece al corregir el campo', async () => {
    mockItemApi();
    const { user, dialog, title, save } = await openForm();

    await user.clear(title);
    await user.click(save);
    expect(within(dialog).getByText(error('nombre'))).toBeInTheDocument();

    await user.type(title, 'Taladro');
    expect(within(dialog).queryByText(error('nombre'))).not.toBeInTheDocument();
  });

  it('muestra en su campo el error que devuelve la API y no cierra la ventana', async () => {
    mockItemApi({
      onSave: () =>
        Response.json({ error: 'Precio no válido', field: 'dailyPrice' }, { status: 400 }),
    });
    const { user, dialog, dailyPrice, save } = await openForm();

    await user.click(save);

    expect(await within(dialog).findByText(error('precio por día'))).toBeInTheDocument();
    expect(dailyPrice).toHaveAttribute('aria-invalid', 'true');
    expect(save).toBeEnabled();
  });

  it('muestra un aviso general si la API falla sin indicar campo', async () => {
    mockItemApi({
      onSave: () => Response.json({ error: 'No puedes editar este objeto.' }, { status: 403 }),
    });
    const { user, dialog, save } = await openForm();

    await user.click(save);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No puedes editar este objeto.',
    );
  });

  it('si el objeto no existe muestra el error en la ventana', async () => {
    mockItemApi({
      onLoad: () => Response.json({ error: 'Objeto no encontrado' }, { status: 404 }),
    });
    const { user, dialog } = await openEditor();

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Objeto no encontrado');
    expect(within(dialog).queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('si la sesión ya no es válida (401) la borra y vuelve al login', async () => {
    mockItemApi({
      onLoad: () =>
        Response.json(
          { error: 'Sesión no válida o caducada. Inicia sesión de nuevo.' },
          { status: 401 },
        ),
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/mis-objetos');

    await user.click(await screen.findByRole('button', { name: 'Editar Taladro percutor' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it.each([
    ['el botón «Cancelar»', 'Cancelar'],
    ['la «×» de la cabecera', 'Cerrar ventana'],
  ])('%s cierra la ventana sin guardar y devuelve el foco a «Editar»', async (_, name) => {
    const fetchMock = mockItemApi();
    const { user, dialog, editButton } = await openForm();

    await user.click(within(dialog).getByRole('button', { name }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(editButton).toHaveFocus();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });
});
