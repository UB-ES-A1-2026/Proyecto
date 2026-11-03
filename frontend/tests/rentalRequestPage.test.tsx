// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION_KEY = 'rentit.session';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u2', username: 'bruno', email: 'bruno@rentit.test', role: 'user' },
};

const ITEM_ID = '8b0e0000-0000-4000-8000-000000000001';

// Respuesta de GET /api/objetos/:id (#119), con los campos que usa la pantalla y alguno más.
const ITEM = {
  id: ITEM_ID,
  title: 'Taladro percutor Bosch',
  description: 'Taladro con maletín.',
  dailyPrice: '6.00',
  deposit: '40.00',
  status: 'published',
  photos: [{ id: 'f1', url: 'https://fotos.rentit.test/taladro.jpg' }],
  owner: { id: 'u1', username: 'ana' },
};

const RESERVATION = {
  id: 'reserva-1',
  item: { id: ITEM_ID, title: 'Taladro percutor Bosch' },
  startDate: '2026-11-10',
  endDate: '2026-11-12',
  totalPrice: '18.00',
  status: 'pending',
  renter: { id: 'u2', username: 'bruno' },
  owner: { id: 'u1', username: 'ana' },
  createdAt: '2026-11-03T12:00:00.000Z',
};

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function mockApi(onItem: Handler = () => Response.json(ITEM)) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/reservas')) return Response.json(RESERVATION, { status: 201 });
    return onItem(url, init);
  });
}

const PATH = `/objetos/${ITEM_ID}/solicitar`;

beforeEach(() => {
  // Solo se finge la fecha: «hoy» es el 3 de noviembre de 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('pantalla /objetos/:id/solicitar (US-04.01, #121)', () => {
  it('sin sesión lleva al login', () => {
    const { router } = renderRoute(PATH);

    expect(router.state.location.pathname).toBe('/login');
  });

  it('pide el objeto con el token y muestra el selector con su precio', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    const fetchMock = mockApi();

    renderRoute(PATH);

    expect(screen.getByText('Cargando el objeto…')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Solicitar alquiler' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Taladro percutor Bosch · 6,00\s€ \/ día/)).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(new RegExp(`/objetos/${ITEM_ID}$`));
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token-de-prueba' });
  });

  it('al confirmar crea la solicitud y lleva a «Mis solicitudes»', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    const fetchMock = mockApi();
    const user = userEvent.setup();
    const { router } = renderRoute(PATH);

    fireEvent.change(await screen.findByLabelText('Fecha de inicio'), {
      target: { value: '2026-11-10' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: '2026-11-12' } });
    expect(screen.getByText('18,00 €')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Solicitar alquiler' }));
    // La foto es decorativa (alt=""), así que no tiene rol «img»: se busca por su clase.
    expect(document.querySelector('.rental-item-photo')).toHaveAttribute('src', ITEM.photos[0].url);
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/mis-solicitudes'));
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      itemId: ITEM_ID,
      startDate: '2026-11-10',
      endDate: '2026-11-12',
    });
  });

  it('«Cancelar» vuelve al detalle del objeto', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockApi();
    const user = userEvent.setup();
    const { router } = renderRoute(PATH);

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(router.state.location.pathname).toBe(`/objetos/${ITEM_ID}`);
  });

  it('si el objeto no existe muestra el error de la API', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockApi(() => Response.json({ error: 'No hemos encontrado este objeto.' }, { status: 404 }));

    renderRoute(PATH);

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos encontrado este objeto.');
    expect(screen.getByRole('link', { name: 'Volver a la página inicial' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('un objeto que no está publicado no se puede solicitar', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockApi(() => Response.json({ ...ITEM, status: 'paused' }));

    renderRoute(PATH);

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos encontrado este objeto.');
    expect(screen.queryByLabelText('Fecha de inicio')).not.toBeInTheDocument();
  });

  it('con la sesión caducada al cargar el objeto lleva al login', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockApi(() => Response.json({ error: 'Sesión no válida' }, { status: 401 }));

    const { router } = renderRoute(PATH);

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
