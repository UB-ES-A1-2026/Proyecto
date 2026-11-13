// Generado con asistencia de IA (Claude)
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReservationCard } from '../src/components/ReservationCard';
import { StarRating } from '../src/components/StarRating';
import type { Reservation } from '../src/services/reservationService';
import { renderRoute } from './renderRoute';

// US-08.01 Valorar un alquiler, frontend (#296): criterios de aceptación de la historia (#74).

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u2', username: 'bruno', email: 'bruno@rentit.test', role: 'user' },
};

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    item: { id: 'item-1', title: 'Taladro percutor Bosch' },
    startDate: '2026-11-04',
    endDate: '2026-11-06',
    totalPrice: '18.00',
    status: 'finished',
    renter: { id: 'u2', username: 'bruno' },
    owner: { id: 'u1', username: 'ana' },
    createdAt: '2026-11-01T12:00:00.000Z',
    myRating: null,
    ...overrides,
  };
}

const RATED = {
  score: 4,
  comment: 'Todo perfecto, muy amable.',
  createdAt: '2026-11-07T10:00:00.000Z',
};

type Reply = Response | (() => Response | Promise<Response>);

// Responde según el método y el final de la URL.
function mockApi(routes: Record<string, Reply | Reply[]>) {
  const counters = new Map<string, number>();
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const key = Object.keys(routes).find((candidate) => {
      const [routeMethod, path] = candidate.split(' ');
      return routeMethod === method && url.endsWith(path);
    });
    if (!key) throw new Error(`Petición inesperada: ${method} ${url}`);
    const replies = routes[key];
    const list = Array.isArray(replies) ? replies : [replies];
    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    const reply = list[Math.min(index, list.length - 1)];
    return typeof reply === 'function' ? reply() : reply.clone();
  });
}

function logIn() {
  localStorage.setItem('rentit.session', JSON.stringify(SESSION));
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Estrellas (criterio 2)', () => {
  function Harness() {
    const [value, setValue] = useState<number | null>(null);
    return <StarRating value={value} onChange={setValue} />;
  }

  it('se elige de 1 a 5 estrellas y se dice qué significa cada una', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const group = screen.getByRole('group', { name: 'Puntuación' });
    const stars = within(group).getAllByRole('radio');
    expect(stars).toHaveLength(5);
    expect(screen.getByText('Elige de 1 a 5')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '4 estrellas: Bien' }));

    expect(screen.getByRole('radio', { name: '4 estrellas: Bien' })).toBeChecked();
    expect(screen.getByText('Bien')).toBeInTheDocument();
  });

  it('con el teclado, las flechas cambian la puntuación', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('radio', { name: '2 estrellas: Mal' }));
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: '3 estrellas: Normal' })).toBeChecked();
  });
});

describe('«Valorar» en Mis solicitudes (criterios 1 y 8)', () => {
  it('sale en un alquiler enviado y finalizado, y lleva al formulario', () => {
    render(
      <MemoryRouter>
        <ReservationCard reservation={reservation()} role="sent" />
        <ReservationCard
          reservation={reservation({
            id: 'r2',
            status: 'paid',
            item: { id: 'i2', title: 'Escalera' },
          })}
          role="sent"
        />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link', { name: /^Valorar/, hidden: true });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Valorar el alquiler de Taladro percutor Bosch');
    expect(links[0]).toHaveAttribute('href', '/mis-solicitudes/r1/valorar');
  });

  it('ya valorado, muestra la valoración en lugar de «Valorar»', () => {
    render(
      <MemoryRouter>
        <ReservationCard reservation={reservation({ myRating: RATED })} role="sent" />
      </MemoryRouter>,
    );

    const card = screen.getByRole('article');
    expect(within(card).queryByRole('link', { name: /^Valorar/, hidden: true })).toBeNull();
    expect(card).toHaveTextContent('Tu valoración');
    expect(within(card).getByRole('img', { name: '4 de 5 estrellas', hidden: true })).toBeTruthy();
    expect(card).toHaveTextContent('«Todo perfecto, muy amable.»');
  });

  it('en las recibidas no sale: valorar al inquilino es US-08.02', () => {
    render(
      <MemoryRouter>
        <ReservationCard reservation={reservation()} role="received" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /^Valorar/, hidden: true })).toBeNull();
  });
});

describe('Formulario «Valorar» (US-08.01, #296)', () => {
  it('muestra el alquiler, las estrellas y el comentario opcional', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
    });

    renderRoute('/mis-solicitudes/r1/valorar');

    expect(await screen.findByRole('link', { name: 'Taladro percutor Bosch' })).toHaveAttribute(
      'href',
      '/objetos/item-1',
    );
    expect(screen.getByText('Del 4 de noviembre de 2026 al 6 de noviembre de 2026')).toBeTruthy();
    expect(screen.getByText('Propietario: ana')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Puntuación' })).toBeInTheDocument();
    expect(screen.getByLabelText('Comentario (opcional)')).toHaveAttribute('maxlength', '1000');
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute(
      'href',
      '/mis-solicitudes',
    );
  });

  it('sin puntuación no se publica y se indica en ese campo (criterios 4 y 5)', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes/r1/valorar');

    await user.type(await screen.findByLabelText('Comentario (opcional)'), 'Muy bien');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    const group = screen.getByRole('group', { name: 'Puntuación' });
    expect(group).toHaveAccessibleDescription('Elige una puntuación de 1 a 5 estrellas.');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);

    // Al elegir una, el error desaparece.
    await user.click(screen.getByRole('radio', { name: '5 estrellas: Excelente' }));
    expect(group).not.toHaveAccessibleDescription();
  });

  it('publica la puntuación y el comentario, y vuelve a Mis solicitudes con la valoración (criterios 3, 6 y 8)', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /usuarios/me/reservas': [
        Response.json({ sent: [reservation()], received: [] }),
        Response.json({ sent: [reservation({ myRating: RATED })], received: [] }),
      ],
      'POST /reservas/r1/valoracion': Response.json(
        {
          id: 'v1',
          reservationId: 'r1',
          score: 4,
          comment: 'Todo perfecto, muy amable.',
          author: { id: 'u2', username: 'bruno' },
          createdAt: RATED.createdAt,
        },
        { status: 201 },
      ),
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/mis-solicitudes/r1/valorar');

    await user.click(await screen.findByRole('radio', { name: '4 estrellas: Bien' }));
    await user.type(
      screen.getByLabelText('Comentario (opcional)'),
      '  Todo perfecto, muy amable.  ',
    );
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/mis-solicitudes'));
    expect(await screen.findByRole('status')).toHaveTextContent('Valoración publicada.');

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      score: 4,
      comment: 'Todo perfecto, muy amable.',
    });
    expect(new Headers(post?.[1]?.headers).get('Authorization')).toBe('Bearer token-de-prueba');

    await user.click(await screen.findByRole('button', { name: /Taladro percutor Bosch/ }));
    expect(screen.getByText('Tu valoración')).toBeInTheDocument();
  });

  it('mientras publica, el botón está desactivado', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'POST /reservas/r1/valoracion': () => new Promise<Response>(() => undefined),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes/r1/valorar');

    await user.click(await screen.findByRole('radio', { name: '3 estrellas: Normal' }));
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(screen.getByRole('button', { name: 'Publicando…' })).toBeDisabled();
    expect(screen.getByLabelText('Comentario (opcional)')).toBeDisabled();
  });

  it('si ya lo había valorado (otra pestaña), lo dice y no deja publicar otra (criterio 8)', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'POST /reservas/r1/valoracion': Response.json(
        { error: 'Ya has valorado este alquiler.' },
        { status: 409 },
      ),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes/r1/valorar');

    await user.click(await screen.findByRole('radio', { name: '5 estrellas: Excelente' }));
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya has valorado este alquiler.');
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
  });

  it('si la API rechaza el comentario, lo indica en ese campo', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'POST /reservas/r1/valoracion': Response.json(
        { error: 'El campo "comentario" no es correcto, revísalo.', field: 'comment' },
        { status: 400 },
      ),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes/r1/valorar');

    await user.click(await screen.findByRole('radio', { name: '2 estrellas: Mal' }));
    await user.type(screen.getByLabelText('Comentario (opcional)'), 'Texto');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    const commentField = screen.getByLabelText('Comentario (opcional)');
    await waitFor(() => expect(commentField).toHaveAttribute('aria-invalid', 'true'));
    expect(commentField).toHaveAccessibleDescription(
      /El campo "comentario" no es correcto, revísalo\./,
    );
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled();
  });

  it.each([
    ['ya valorado', reservation({ myRating: RATED }), 'Ya has valorado este alquiler.'],
    [
      'sin finalizar',
      reservation({ status: 'paid' }),
      'Solo se puede valorar un alquiler finalizado.',
    ],
  ])('un alquiler %s no muestra el formulario (criterios 1 y 8)', async (_label, data, message) => {
    logIn();
    mockApi({ 'GET /usuarios/me/reservas': Response.json({ sent: [data], received: [] }) });

    renderRoute('/mis-solicitudes/r1/valorar');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('group', { name: 'Puntuación' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a Mis solicitudes' })).toBeInTheDocument();
  });

  it('un alquiler que no ha hecho (o recibido) no se puede valorar aquí (criterio 7)', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [], received: [reservation()] }),
    });

    renderRoute('/mis-solicitudes/r1/valorar');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos encontrado este alquiler.',
    );
  });

  it('sin sesión lleva al login', async () => {
    const { router } = renderRoute('/mis-solicitudes/r1/valorar');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('si no se puede cargar, lo dice', async () => {
    logIn();
    mockApi({ 'GET /usuarios/me/reservas': Response.json({ error: 'Error' }, { status: 500 }) });

    renderRoute('/mis-solicitudes/r1/valorar');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos podido cargar el alquiler. Inténtalo de nuevo más tarde.',
    );
  });
});
