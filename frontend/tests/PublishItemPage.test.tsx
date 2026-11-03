import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/services/apiClient';
import { uploadItemPhoto } from '../src/services/photoService';
import { renderRoute } from './renderRoute';

vi.mock('../src/services/photoService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/photoService')>();
  return { ...actual, uploadItemPhoto: vi.fn() };
});

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'user-1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const CATEGORIES = [
  { id: 'category-1', name: 'Herramientas y bricolaje' },
  { id: 'category-2', name: 'Electrónica' },
];

const VALID = {
  title: 'Taladro percutor',
  description: 'Taladro en buen estado, con brocas incluidas.',
  categoryId: 'category-1',
  dailyPrice: '5,50',
  deposit: '',
  neighborhood: 'Gràcia',
};

const NativeURL = globalThis.URL;

class TestURL extends NativeURL {
  static override createObjectURL(blob: Blob | MediaSource): string {
    return `blob:${blob instanceof File ? blob.name : 'preview'}`;
  }

  static override revokeObjectURL(_url: string): void {}
}

type MockApiOptions = {
  categoriesStatus?: number;
  createStatus?: number;
  createBody?: unknown;
};

function mockApi(options: MockApiOptions = {}) {
  const postBodies: unknown[] = [];
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/categorias')) {
      return Response.json(CATEGORIES, { status: options.categoriesStatus ?? 200 });
    }
    if (url.endsWith('/objetos') && init?.method === 'POST') {
      postBodies.push(JSON.parse(String(init.body)) as unknown);
      return Response.json(
        options.createBody ?? { id: 'item-123', title: VALID.title },
        { status: options.createStatus ?? 201 },
      );
    }
    return Response.json({});
  });
  return { fetchMock, postBodies };
}

function renderPublishPage() {
  localStorage.setItem('rentit.session', JSON.stringify(SESSION));
  return renderRoute('/objetos/nuevo');
}

async function fillValidForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<typeof VALID> = {},
) {
  const values = { ...VALID, ...overrides };
  if (values.title) await user.type(screen.getByLabelText('Nombre'), values.title);
  if (values.description) {
    await user.type(screen.getByLabelText('Descripción'), values.description);
  }
  await user.selectOptions(screen.getByLabelText('Categoría'), values.categoryId);
  if (values.dailyPrice) {
    await user.type(screen.getByLabelText('Precio por día (€)'), values.dailyPrice);
  }
  if (values.deposit) await user.type(screen.getByLabelText('Fianza (€)'), values.deposit);
  if (values.neighborhood) await user.type(screen.getByLabelText('Barrio'), values.neighborhood);
}

beforeEach(() => {
  vi.spyOn(TestURL, 'createObjectURL');
  vi.spyOn(TestURL, 'revokeObjectURL');
  vi.stubGlobal('URL', TestURL);
  vi.mocked(uploadItemPhoto).mockReset().mockResolvedValue({
    id: 'photo-1',
    key: 'items/item-123/photo-1.webp',
    order: 1,
    url: 'https://example.test/photo.webp',
  });
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('publicar un objeto (US-02.01, #13)', () => {
  it('sin sesión redirige a /login y no muestra el enlace de publicación', () => {
    mockApi();
    const { router } = renderRoute('/objetos/nuevo');

    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Publicar objeto' })).not.toBeInTheDocument();
  });

  it('muestra las categorías recibidas desde la API', async () => {
    mockApi();
    renderPublishPage();

    expect(await screen.findByRole('option', { name: 'Herramientas y bricolaje' })).toHaveValue(
      'category-1',
    );
    expect(screen.getByRole('option', { name: 'Electrónica' })).toHaveValue('category-2');
  });

  it('rechaza el precio 0, muestra el error y no hace POST', async () => {
    const user = userEvent.setup();
    const { fetchMock } = mockApi();
    renderPublishPage();
    await fillValidForm(user, { dailyPrice: '0' });

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(
      screen.getByText('El campo "precio" no es correcto, revísalo.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Precio por día (€)')).toHaveFocus();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('rechaza el nombre vacío y no hace POST', async () => {
    const user = userEvent.setup();
    const { fetchMock } = mockApi();
    renderPublishPage();
    await fillValidForm(user, { title: '' });

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(
      screen.getByText('El campo "nombre" no es correcto, revísalo.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('envía 5,50 como 5.5 y la fianza vacía como 0, y navega al objeto creado', async () => {
    const user = userEvent.setup();
    const { fetchMock, postBodies } = mockApi();
    const { router } = renderPublishPage();
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/objetos/item-123'));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/objetos$/),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(postBodies).toEqual([
      {
        title: 'Taladro percutor',
        description: 'Taladro en buen estado, con brocas incluidas.',
        categoryId: 'category-1',
        dailyPrice: 5.5,
        deposit: 0,
        neighborhood: 'Gràcia',
        homeDelivery: false,
        riderDelivery: false,
        pickupPointDelivery: false,
        status: 'published',
      },
    ]);
  });

  it('sube dos fotografías una a una con el id del objeto creado', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPublishPage();
    await fillValidForm(user);
    const photos = [
      new File(['photo-one'], 'one.png', { type: 'image/png' }),
      new File(['photo-two'], 'two.webp', { type: 'image/webp' }),
    ];
    await user.upload(screen.getByLabelText('Fotografías'), photos);

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(uploadItemPhoto).toHaveBeenCalledTimes(2));
    expect(uploadItemPhoto).toHaveBeenNthCalledWith(1, 'item-123', photos[0], SESSION.token);
    expect(uploadItemPhoto).toHaveBeenNthCalledWith(2, 'item-123', photos[1], SESSION.token);
  });

  it('rechaza un SVG como fotografía', async () => {
    const user = userEvent.setup();
    const { fetchMock } = mockApi();
    renderPublishPage();
    await fillValidForm(user);
    const svg = new File(['<svg />'], 'drawing.svg', { type: 'image/svg+xml' });
    const input = screen.getByLabelText('Fotografías');
    input.removeAttribute('accept');
    await user.upload(input, svg);

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(
      screen.getByText('El campo "fotografías" no es correcto, revísalo.'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('rechaza más de cinco fotografías', async () => {
    const user = userEvent.setup();
    const { fetchMock } = mockApi();
    renderPublishPage();
    await fillValidForm(user);
    const photos = Array.from(
      { length: 6 },
      (_, index) => new File([`photo-${index}`], `${index}.png`, { type: 'image/png' }),
    );
    await user.upload(screen.getByLabelText('Fotografías'), photos);

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(
      screen.getByText('El campo "fotografías" no es correcto, revísalo.'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('muestra debajo de Barrio el error de API field neighborhood', async () => {
    const user = userEvent.setup();
    mockApi({
      createStatus: 400,
      createBody: { error: 'Barrio inválido', field: 'neighborhood' },
    });
    renderPublishPage();
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(
      await screen.findByText('El campo "barrio" no es correcto, revísalo.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Barrio')).toHaveAttribute('aria-invalid', 'true');
  });

  it('si falla una foto conserva el anuncio creado y ofrece verlo', async () => {
    const user = userEvent.setup();
    const { fetchMock, postBodies } = mockApi();
    vi.mocked(uploadItemPhoto).mockRejectedValueOnce(
      new ApiError(503, 'No se ha podido subir la foto.', 'photos'),
    );
    renderPublishPage();
    await fillValidForm(user);
    await user.upload(
      screen.getByLabelText('Fotografías'),
      new File(['photo'], 'one.png', { type: 'image/png' }),
    );

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El anuncio se ha publicado, pero alguna foto no se ha podido subir.',
    );
    expect(screen.getByRole('link', { name: 'Ver el anuncio' })).toHaveAttribute(
      'href',
      '/objetos/item-123',
    );
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    expect(postBodies).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).endsWith('/api/objetos') && init?.method === 'POST',
      ),
    ).toHaveLength(1);
    expect(uploadItemPhoto).toHaveBeenCalledTimes(1);
  });

  it('Quitar elimina la fotografía y libera su URL de previsualización', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPublishPage();
    const photo = new File(['photo'], 'one.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Fotografías'), photo);

    expect(screen.getByRole('img', { name: 'Vista previa de fotografía 1' })).toHaveAttribute(
      'src',
      'blob:one.png',
    );
    await user.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:one.png');
  });

  it('avisa cuando no se pueden cargar las categorías', async () => {
    mockApi({ categoriesStatus: 503 });
    renderPublishPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se han podido cargar las categorías.',
    );
  });
});
