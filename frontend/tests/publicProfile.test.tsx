// Generado con asistencia de IA (Claude)
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/services/apiClient';
import { uploadProfilePhoto } from '../src/services/photoService';
import type { PublicProfile } from '../src/services/userService';
import { renderRoute } from './renderRoute';

vi.mock('../src/services/photoService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/photoService')>();
  return { ...actual, uploadProfilePhoto: vi.fn() };
});

const SESSION_KEY = 'rentit.session';

const OWNER = {
  token: 'token-de-ana',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};
const VISITOR = {
  token: 'token-de-bruno',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u2', username: 'bruno', email: 'bruno@rentit.test', role: 'user' },
};

function profile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: 'u1',
    username: 'ana',
    bio: 'Vecina de Gràcia. Presto herramientas.',
    photo: null,
    memberSince: '2026-10-18T10:00:00.000Z',
    rating: { average: null, count: 0 },
    items: [
      {
        id: 'o1',
        title: 'Taladro percutor',
        dailyPrice: '6.00',
        neighborhood: 'Gràcia',
        photo: null,
      },
      {
        id: 'o2',
        title: 'Tienda de campaña',
        dailyPrice: '12.00',
        neighborhood: 'Sants',
        photo: null,
      },
    ],
    isOwnProfile: false,
    ...overrides,
  };
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function mockApi(handler: Handler) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => handler(String(input), init));
}

function signIn(session = OWNER) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

const PNG = new File(['foto'], 'perfil.png', { type: 'image/png' });

beforeEach(() => {
  // jsdom no trae estas dos: la ventana las usa para la vista previa de la foto.
  URL.createObjectURL = vi.fn(() => 'blob:vista-previa');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(uploadProfilePhoto).mockReset();
});

describe('perfil público (US-01.4, #301)', () => {
  it('cualquiera ve la foto o inicial, la bio, la valoración y los objetos publicados, sin el correo', async () => {
    const fetchMock = mockApi(() => Response.json(profile()));

    renderRoute('/usuarios/u1');

    expect(await screen.findByRole('heading', { level: 1, name: 'ana' })).toBeInTheDocument();
    expect(screen.getByText('Vecina de Gràcia. Presto herramientas.')).toBeInTheDocument();
    expect(screen.getByText('Miembro desde 18 de octubre de 2026')).toBeInTheDocument();
    expect(screen.getByText('Todavía sin valoraciones')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar perfil' })).not.toBeInTheDocument();

    const items = within(screen.getByRole('region', { name: 'Objetos publicados' }));
    expect(items.getByRole('link', { name: 'Taladro percutor' })).toHaveAttribute(
      'href',
      '/objetos/o1',
    );
    expect(items.getByRole('link', { name: 'Tienda de campaña' })).toHaveAttribute(
      'href',
      '/objetos/o2',
    );
    expect(items.getByText('Gràcia')).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/usuarios/u1');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('muestra la valoración media con su número de valoraciones', async () => {
    mockApi(() => Response.json(profile({ rating: { average: 4.5, count: 2 } })));

    renderRoute('/usuarios/u1');

    expect(await screen.findByText(/Valoración media:/)).toHaveTextContent(
      'Valoración media: 4,5 de 5 · 2 valoraciones',
    );
  });

  it('con la sesión de otra persona no aparece «Editar perfil»', async () => {
    signIn(VISITOR);
    const fetchMock = mockApi(() => Response.json(profile({ isOwnProfile: false })));

    renderRoute('/usuarios/u1');

    await screen.findByRole('heading', { level: 1, name: 'ana' });
    expect(screen.queryByRole('button', { name: 'Editar perfil' })).not.toBeInTheDocument();
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer token-de-bruno',
    );
  });

  it('si el usuario no existe lo dice y ofrece volver al inicio', async () => {
    mockApi(() => Response.json({ error: 'No hemos encontrado este usuario.' }, { status: 404 }));

    renderRoute('/usuarios/no-existe');

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos encontrado este usuario.');
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('sin objetos publicados lo explica, distinto en el perfil propio', async () => {
    signIn();
    mockApi(() => Response.json(profile({ items: [], bio: null, isOwnProfile: true })));

    renderRoute('/usuarios/u1');

    expect(await screen.findByText('Todavía no has publicado ningún objeto.')).toBeInTheDocument();
    expect(screen.getByText('Añade una bio para que los demás te conozcan.')).toBeInTheDocument();
  });

  it('si falla la petición muestra el motivo', async () => {
    mockApi(() => Response.json({ error: 'Algo ha ido mal.' }, { status: 500 }));

    renderRoute('/usuarios/u1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo ha ido mal.');
  });
});

describe('editar el propio perfil (US-01.4, #301)', () => {
  it('guarda la bio nueva, cierra la ventana y actualiza el perfil', async () => {
    signIn();
    const fetchMock = mockApi((_url, init) =>
      init?.method === 'PATCH'
        ? Response.json(profile({ bio: 'Nueva bio.', isOwnProfile: true }))
        : Response.json(profile({ isOwnProfile: true })),
    );
    const user = userEvent.setup();
    renderRoute('/usuarios/u1');

    await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Editar perfil' }));
    const bio = dialog.getByLabelText('Bio');
    expect(bio).toHaveValue('Vecina de Gràcia. Presto herramientas.');
    await user.clear(bio);
    await user.type(bio, '  Nueva bio.  ');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Perfil actualizado.');
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe('http://localhost:3000/api/usuarios/me');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ bio: 'Nueva bio.' });
    expect(new Headers(patch?.[1]?.headers).get('Authorization')).toBe('Bearer token-de-ana');
    expect(screen.getByText('Nueva bio.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('borrar la bio manda una cadena vacía', async () => {
    signIn();
    const fetchMock = mockApi((_url, init) =>
      Response.json(profile({ bio: init?.method === 'PATCH' ? null : 'Algo', isOwnProfile: true })),
    );
    const user = userEvent.setup();
    renderRoute('/usuarios/u1');

    await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    await user.clear(screen.getByLabelText('Bio'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await screen.findByRole('status');
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ bio: '' });
  });

  it('«Cancelar» y «Guardar» sin cambios no envían nada', async () => {
    signIn();
    const fetchMock = mockApi(() => Response.json(profile({ isOwnProfile: true })));
    const user = userEvent.setup();
    renderRoute('/usuarios/u1');

    await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    await user.type(screen.getByLabelText('Bio'), ' cambio');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar perfil' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('si la API rechaza la bio (400) lo dice junto al campo y la ventana sigue abierta', async () => {
    signIn();
    mockApi((_url, init) =>
      init?.method === 'PATCH'
        ? Response.json({ error: 'La bio no es válida.', field: 'bio' }, { status: 400 })
        : Response.json(profile({ isOwnProfile: true })),
    );
    const user = userEvent.setup();
    renderRoute('/usuarios/u1');

    await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    await user.type(screen.getByLabelText('Bio'), ' x');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El campo "bio" no es correcto, revísalo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Bio')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog', { name: 'Editar perfil' })).toBeInTheDocument();
  });

  it('cambia la foto: vista previa, subida con el token y foto nueva en el perfil', async () => {
    signIn();
    mockApi(() => Response.json(profile({ isOwnProfile: true })));
    vi.mocked(uploadProfilePhoto).mockResolvedValue(
      profile({ photo: 'https://bucket.test/ana.webp', isOwnProfile: true }),
    );
    const user = userEvent.setup();
    const { container } = renderRoute('/usuarios/u1');

    await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    await user.upload(screen.getByLabelText('Elegir una foto de perfil'), PNG);
    expect(document.querySelector('dialog img')).toHaveAttribute('src', 'blob:vista-previa');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Perfil actualizado.');
    expect(uploadProfilePhoto).toHaveBeenCalledWith(PNG, 'token-de-ana');
    expect(container.querySelector('.public-profile-header img')).toHaveAttribute(
      'src',
      'https://bucket.test/ana.webp',
    );
  });

  it('«Quitar foto» borra la foto actual al guardar', async () => {
    signIn();
    const fetchMock = mockApi((_url, init) =>
      init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json(profile({ photo: 'https://bucket.test/ana.webp', isOwnProfile: true })),
    );
    const user = userEvent.setup();
    const { container } = renderRoute('/usuarios/u1');

    await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    await user.click(screen.getByRole('button', { name: 'Quitar foto' }));
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await screen.findByRole('status');
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(request?.[0]).toBe('http://localhost:3000/api/usuarios/me/foto');
    expect(container.querySelector('.public-profile-header img')).not.toBeInTheDocument();
  });

  it('rechaza un archivo que no es JPG, PNG o WebP sin subir nada', async () => {
    signIn();
    mockApi(() => Response.json(profile({ isOwnProfile: true })));
    const user = userEvent.setup({ applyAccept: false });
    renderRoute('/usuarios/u1');

    await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    await user.upload(
      screen.getByLabelText('Elegir una foto de perfil'),
      new File(['x'], 'doc.pdf', { type: 'application/pdf' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Solo se pueden subir fotos JPG, PNG o WebP.',
    );
    expect(uploadProfilePhoto).not.toHaveBeenCalled();
  });

  it('si la foto falla pero la bio se guardó, avisa y conserva la bio', async () => {
    signIn();
    mockApi((_url, init) =>
      init?.method === 'PATCH'
        ? Response.json(profile({ bio: 'Bio nueva', isOwnProfile: true }))
        : Response.json(profile({ isOwnProfile: true })),
    );
    vi.mocked(uploadProfilePhoto).mockRejectedValue(new ApiError(503, 'Sin almacenamiento.'));
    const user = userEvent.setup();
    renderRoute('/usuarios/u1');

    await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    await user.upload(screen.getByLabelText('Elegir una foto de perfil'), PNG);
    await user.type(screen.getByLabelText('Bio'), ' y más');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Se han guardado los cambios, pero no se ha podido subir la foto.',
    );
    expect(screen.getByText('Bio nueva')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('si solo falla la foto, la ventana sigue abierta con el motivo', async () => {
    signIn();
    mockApi(() => Response.json(profile({ isOwnProfile: true })));
    vi.mocked(uploadProfilePhoto).mockRejectedValue(new ApiError(503, 'Sin almacenamiento.'));
    const user = userEvent.setup();
    renderRoute('/usuarios/u1');

    await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    await user.upload(screen.getByLabelText('Elegir una foto de perfil'), PNG);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Sin almacenamiento.',
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled());
  });
});
