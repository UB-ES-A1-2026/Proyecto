import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const CATEGORIES = [
  { id: 'c-deporte', name: 'Deporte' },
  { id: 'c-rara', name: 'Categoría nueva' },
];

function buildItem(index: number) {
  return {
    id: `item-${index}`,
    title: `Objeto ${index}`,
    dailyPrice: '5',
    neighborhood: 'Gràcia',
    category: { id: 'c-deporte', name: 'Deporte' },
    photo: null,
  };
}

function mockApi({
  categories = () => Response.json(CATEGORIES),
  items = () => Response.json({ items: [buildItem(1)], page: 1, pageSize: 20, total: 1 }),
}: {
  categories?: () => Response | Promise<Response>;
  items?: () => Response | Promise<Response>;
} = {}) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) =>
      String(input).endsWith('/categorias') ? categories() : items(),
    );
}

beforeEach(() => {
  mockApi();
});

afterEach(() => localStorage.clear());

describe('home (#7)', () => {
  it('sin sesión presenta Rentit y enlaza a iniciar sesión y a crear cuenta', () => {
    renderRoute('/');
    // La cabecera (#21) también tiene estos enlaces: aquí se comprueban los de la home.
    const home = within(screen.getByRole('main'));

    expect(home.getByRole('heading', { level: 1, name: 'Rentit' })).toBeInTheDocument();
    expect(home.getByText('Alquila objetos a tus vecinos.')).toBeInTheDocument();
    expect(home.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(home.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro');
    expect(home.queryByRole('link', { name: 'Publicar un objeto' })).not.toBeInTheDocument();
    expect(home.getByRole('search')).toBeInTheDocument();
    expect(home.getByRole('searchbox', { name: '¿Qué quieres alquilar?' })).toHaveAttribute(
      'placeholder',
      'Por ejemplo, taladro',
    );
  });

  it('con sesión saluda al usuario, da acceso a publicar y no muestra los enlaces de acceso', () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));

    renderRoute('/');
    const home = within(screen.getByRole('main'));

    expect(home.getByRole('heading', { level: 1, name: 'Hola, ana' })).toBeInTheDocument();
    expect(home.getByRole('link', { name: 'Publicar un objeto' })).toHaveAttribute(
      'href',
      '/objetos/nuevo',
    );
    expect(home.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(home.queryByRole('link', { name: 'Crear cuenta' })).not.toBeInTheDocument();
    expect(home.getByRole('search')).toBeInTheDocument();
  });

  it('ya no muestra el estado provisional de la API del esqueleto', () => {
    renderRoute('/');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('explica cómo funciona en tres pasos', () => {
    renderRoute('/');

    const section = within(screen.getByRole('region', { name: 'Cómo funciona' }));
    expect(section.getAllByRole('listitem')).toHaveLength(3);
    expect(section.getAllByRole('heading', { level: 3 })).toHaveLength(3);
  });
});

describe('categorías de la home', () => {
  it('cada categoría lleva a la búsqueda filtrada por ella', async () => {
    renderRoute('/');

    const section = within(await screen.findByRole('region', { name: 'Explora por categoría' }));
    expect(section.getByRole('link', { name: 'Deporte' })).toHaveAttribute(
      'href',
      '/buscar?categoryId=c-deporte',
    );
    // Una categoría sin icono propio también sale.
    expect(section.getByRole('link', { name: 'Categoría nueva' })).toHaveAttribute(
      'href',
      '/buscar?categoryId=c-rara',
    );
  });

  it('si fallan, la sección no sale y el resto de la página sigue', async () => {
    mockApi({ categories: () => Promise.reject(new TypeError('Failed to fetch')) });

    renderRoute('/');

    expect(await screen.findByRole('link', { name: 'Objeto 1' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Explora por categoría' })).toBeNull(),
    );
  });
});

describe('novedades de la home', () => {
  it('pide los objetos publicados sin texto y los muestra enlazando a su ficha', async () => {
    const fetchMock = mockApi();

    renderRoute('/');

    const section = within(screen.getByRole('region', { name: 'Novedades' }));
    expect(await section.findByRole('link', { name: 'Objeto 1' })).toHaveAttribute(
      'href',
      '/objetos/item-1',
    );
    expect(section.getByText('5,00 € / día')).toBeInTheDocument();
    expect(section.getByText('Gràcia · Deporte')).toBeInTheDocument();
    expect(section.getByRole('link', { name: 'Ver todos los objetos' })).toHaveAttribute(
      'href',
      '/buscar?q=',
    );
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/objetos', expect.any(Object));
  });

  it('muestra como mucho ocho objetos', async () => {
    const items = Array.from({ length: 20 }, (_, index) => buildItem(index + 1));
    mockApi({ items: () => Response.json({ items, page: 1, pageSize: 20, total: 20 }) });

    renderRoute('/');

    const section = within(screen.getByRole('region', { name: 'Novedades' }));
    expect(await section.findAllByRole('heading', { level: 3 })).toHaveLength(8);
    expect(section.getByRole('link', { name: 'Objeto 8' })).toBeInTheDocument();
    expect(section.queryByRole('link', { name: 'Objeto 9' })).toBeNull();
  });

  it('muestra esqueletos mientras carga', async () => {
    let resolveItems: (response: Response) => void = () => {};
    mockApi({ items: () => new Promise<Response>((resolve) => (resolveItems = resolve)) });

    const { container } = renderRoute('/');

    const novedades = screen.getByRole('region', { name: 'Novedades' });
    expect(novedades.querySelector('.skeleton')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Explora por categoría' })).toBeInTheDocument(),
    );
    resolveItems(Response.json({ items: [buildItem(1)], page: 1, pageSize: 20, total: 1 }));
    expect(await screen.findByRole('link', { name: 'Objeto 1' })).toBeInTheDocument();
    expect(container.querySelector('.skeleton')).not.toBeInTheDocument();
  });

  it('si no hay objetos lo dice y la página sigue', async () => {
    mockApi({ items: () => Response.json({ items: [], page: 1, pageSize: 20, total: 0 }) });

    renderRoute('/');

    expect(await screen.findByText('Todavía no hay objetos publicados.')).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('si fallan muestra un aviso discreto y la página sigue', async () => {
    mockApi({ items: () => Response.json({ error: 'Error' }, { status: 500 }) });

    renderRoute('/');

    expect(
      await screen.findByText('Ahora mismo no podemos mostrar las novedades.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cómo funciona' })).toBeInTheDocument();
  });
});
