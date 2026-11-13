import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

// GET /api/barrios (US-05.01, #307).
const NEIGHBORHOODS = ['Gràcia', 'Sant Antoni', 'Sants'];

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
  neighborhoodsStatus?: number;
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
    if (url.endsWith('/barrios')) {
      return Response.json(NEIGHBORHOODS, { status: options.neighborhoodsStatus ?? 200 });
    }
    if (url.endsWith('/objetos') && init?.method === 'POST') {
      postBodies.push(JSON.parse(String(init.body)) as unknown);
      return Response.json(options.createBody ?? { id: 'item-123', title: VALID.title }, {
        status: options.createStatus ?? 201,
      });
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
  pickupPoint = true,
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
  if (values.neighborhood) {
    await screen.findByRole('option', { name: values.neighborhood });
    await user.selectOptions(screen.getByLabelText('Barrio'), values.neighborhood);
  }
  // Al menos un modo de entrega (US-05.01, #307). El punto de recogida no pide dirección.
  if (pickupPoint) await user.click(deliveryOption('Punto de recogida'));
}

function deliveryOption(name: string) {
  return within(screen.getByRole('group', { name: 'Entrega' })).getByRole('checkbox', { name });
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

    expect(screen.getByText('El campo "precio" no es correcto, revísalo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio por día (€)')).toHaveFocus();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('rechaza el nombre vacío y no hace POST', async () => {
    const user = userEvent.setup();
    const { fetchMock } = mockApi();
    renderPublishPage();
    await fillValidForm(user, { title: '' });

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(screen.getByText('El campo "nombre" no es correcto, revísalo.')).toBeInTheDocument();
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
        pickupPointDelivery: true,
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

  it('añade las fotografías que se arrastran a la zona de fotos', async () => {
    mockApi();
    renderPublishPage();

    fireEvent.drop(screen.getByLabelText('Fotografías'), {
      dataTransfer: { files: [new File(['photo'], 'one.png', { type: 'image/png' })] },
    });

    expect(
      await screen.findByRole('img', { name: 'Vista previa de fotografía 1' }),
    ).toHaveAttribute('src', 'blob:one.png');
    expect(screen.getByText('1 de 5 fotos')).toBeInTheDocument();
  });

  it('las tarjetas de disponibilidad y entrega siguen siendo campos que se envían', async () => {
    const user = userEvent.setup();
    const { postBodies } = mockApi();
    const { router } = renderPublishPage();
    await fillValidForm(user);

    const availability = within(screen.getByRole('group', { name: 'Disponibilidad' }));
    expect(availability.getByRole('radio', { name: 'Disponible ya' })).toBeChecked();
    await user.click(
      availability.getByRole('radio', { name: 'Pausado (no aparece en las búsquedas)' }),
    );
    await user.click(deliveryOption('Entrega por rider'));
    await user.type(screen.getByLabelText('Dirección'), 'Carrer de Verdi, 12');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/objetos/item-123'));
    expect(postBodies).toEqual([
      expect.objectContaining({
        status: 'paused',
        homeDelivery: false,
        riderDelivery: true,
        pickupPointDelivery: true,
        address: 'Carrer de Verdi, 12',
      }),
    ]);
  });

  it('pone el foco en el barrio antes que en el precio, como se ven en pantalla', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPublishPage();
    await fillValidForm(user, { neighborhood: '', dailyPrice: '' });

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(screen.getByLabelText('Barrio')).toHaveFocus();
  });

  it('avisa cuando no se pueden cargar las categorías', async () => {
    mockApi({ categoriesStatus: 503 });
    renderPublishPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se han podido cargar las categorías.',
    );
  });

  describe('apartado «Entrega» (US-05.01, #307)', () => {
    it('el barrio se elige de la lista de GET /api/barrios', async () => {
      mockApi();
      renderPublishPage();

      const barrio = screen.getByLabelText('Barrio');
      expect(await within(barrio).findByRole('option', { name: 'Sants' })).toHaveValue('Sants');
      expect(within(barrio).getByRole('option', { name: 'Elige un barrio' })).toHaveValue('');
      expect(within(barrio).getAllByRole('option')).toHaveLength(NEIGHBORHOODS.length + 1);
    });

    it('avisa cuando no se pueden cargar los barrios', async () => {
      mockApi({ neighborhoodsStatus: 503 });
      renderPublishPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se han podido cargar los barrios.',
      );
    });

    it('sin ningún modo marcado avisa, pone el foco en el apartado y no hace POST', async () => {
      const user = userEvent.setup();
      const { fetchMock } = mockApi();
      renderPublishPage();
      await fillValidForm(user, {}, false);

      await user.click(screen.getByRole('button', { name: 'Publicar' }));

      expect(screen.getByText('Elige al menos un modo de entrega.')).toBeInTheDocument();
      expect(deliveryOption('Recoger en casa del propietario')).toHaveFocus();
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    });

    it('la dirección solo aparece con recogida en casa o rider', async () => {
      const user = userEvent.setup();
      mockApi();
      renderPublishPage();

      expect(screen.queryByLabelText('Dirección')).not.toBeInTheDocument();
      await user.click(deliveryOption('Punto de recogida'));
      expect(screen.queryByLabelText('Dirección')).not.toBeInTheDocument();
      expect(
        screen.getByText('Solo punto de recogida: no hace falta tu dirección.'),
      ).toBeInTheDocument();

      await user.click(deliveryOption('Recoger en casa del propietario'));
      expect(screen.getByLabelText('Dirección')).toBeInTheDocument();
      expect(screen.getByText(/Solo la ves tú/)).toBeInTheDocument();

      await user.click(deliveryOption('Recoger en casa del propietario'));
      expect(screen.queryByLabelText('Dirección')).not.toBeInTheDocument();

      await user.click(deliveryOption('Entrega por rider'));
      expect(screen.getByLabelText('Dirección')).toBeInTheDocument();
    });

    it('con recogida en casa y sin dirección muestra el error y no hace POST', async () => {
      const user = userEvent.setup();
      const { fetchMock } = mockApi();
      renderPublishPage();
      await fillValidForm(user, {}, false);
      await user.click(deliveryOption('Recoger en casa del propietario'));
      await user.type(screen.getByLabelText('Dirección'), '   ');

      await user.click(screen.getByRole('button', { name: 'Publicar' }));

      expect(
        screen.getByText('El campo "dirección" no es correcto, revísalo.'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Dirección')).toHaveFocus();
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    });

    it('con solo punto de recogida no envía dirección aunque se escribiera antes', async () => {
      const user = userEvent.setup();
      const { postBodies } = mockApi();
      const { router } = renderPublishPage();
      await fillValidForm(user);
      await user.click(deliveryOption('Recoger en casa del propietario'));
      await user.type(screen.getByLabelText('Dirección'), 'Carrer de Verdi, 12');
      await user.click(deliveryOption('Recoger en casa del propietario'));

      await user.click(screen.getByRole('button', { name: 'Publicar' }));

      await waitFor(() => expect(router.state.location.pathname).toBe('/objetos/item-123'));
      expect(postBodies[0]).not.toHaveProperty('address');
    });

    it.each([
      ['deliveryModes', 'Elige al menos un modo de entrega.', 'Recoger en casa del propietario'],
      ['address', 'El campo "dirección" no es correcto, revísalo.', 'Dirección'],
    ])('muestra en su sitio el error de la API con field %s', async (field, message, target) => {
      const user = userEvent.setup();
      mockApi({ createStatus: 400, createBody: { error: message, field } });
      renderPublishPage();
      await fillValidForm(user, {}, false);
      await user.click(deliveryOption('Recoger en casa del propietario'));
      await user.type(screen.getByLabelText('Dirección'), 'Carrer de Verdi, 12');

      await user.click(screen.getByRole('button', { name: 'Publicar' }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      const focused =
        target === 'Dirección' ? screen.getByLabelText('Dirección') : deliveryOption(target);
      expect(focused).toHaveFocus();
    });
  });
});
