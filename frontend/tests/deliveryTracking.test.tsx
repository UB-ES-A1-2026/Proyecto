// Generado con asistencia de IA (Claude)
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryTracking } from '../src/services/deliveryTrackingService';
import { renderRoute } from './renderRoute';
import { pickupTracking, sseResponse, tracking } from './trackingFixtures';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u2', username: 'bruno', email: 'bruno@rentit.test', role: 'user' },
};

type Reply = () => Response | Promise<Response>;

// Simula la API: el GET del seguimiento, las acciones y el canal de tiempo real.
function mockApi({
  get,
  patch,
  post,
  stream = () => sseResponse().response,
}: {
  get: Reply;
  patch?: Reply;
  post?: Reply;
  stream?: Reply;
}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/eventos/stream')) return stream();
    if (init?.method === 'PATCH' && patch) return patch();
    if (init?.method === 'POST' && post) return post();
    return get();
  });
}

function calls(fetchMock: ReturnType<typeof mockApi>, method: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) => !String(url).endsWith('/eventos/stream') && (init?.method ?? 'GET') === method,
  );
}

function json(data: DeliveryTracking) {
  return () => Response.json(data);
}

beforeEach(() => localStorage.setItem('rentit.session', JSON.stringify(SESSION)));

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('Seguimiento de la entrega (US-05.02, #67)', () => {
  it('el arrendatario ve los estados con su hora y su código de entrega', async () => {
    mockApi({ get: json(tracking()) });

    renderRoute('/entregas/r1');

    expect(
      await screen.findByRole('heading', { name: 'Entrega de Taladro percutor Bosch' }),
    ).toBeVisible();
    expect(
      screen.getByText('18–20 nov. 2026 · Entrega por rider · Lo antes posible · Alquiler: Pagada'),
    ).toBeVisible();
    const steps = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringMatching(/^✔Asignada \(hecho\) · 18\/11\/2026, \d{2}:02$/),
      expect.stringMatching(/^✔Recogida \(hecho\) · 18\/11\/2026, \d{2}:30$/),
      expect.stringMatching(/^●En camino \(estado actual\) · 18\/11\/2026, \d{2}:41$/),
      '○Entregada (pendiente)',
    ]);
    expect(steps[2]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('482 193')).toBeVisible();
    expect(screen.getByText(/Enséñaselo al rider cuando te dé el objeto/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver a Mis solicitudes' })).toHaveAttribute(
      'href',
      '/mis-solicitudes',
    );
    expect(await screen.findByText('● Actualizado al momento')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('el propietario ve los mismos estados, pero sin código ni botones', async () => {
    mockApi({ get: json(tracking({ role: 'owner', deliveryCode: null })) });

    renderRoute('/entregas/r1');

    expect(await screen.findByText(/Arrendatario: bruno · Alquiler: Pagada/)).toBeVisible();
    expect(screen.queryByText(/Tu código de entrega/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('el rider solo puede marcar el estado siguiente', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      get: json(tracking({ role: 'rider', deliveryStatus: 'assigned', deliveryCode: null })),
      patch: json(tracking({ role: 'rider', deliveryStatus: 'picked_up', deliveryCode: null })),
    });

    renderRoute('/entregas/r1');
    await user.click(await screen.findByRole('button', { name: 'Marcar como Recogida' }));

    expect(await screen.findByRole('button', { name: 'Marcar como En camino' })).toBeVisible();
    const [[url, init]] = calls(fetchMock, 'PATCH');
    expect(url).toBe('http://localhost:3000/api/reservas/r1/entrega');
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'picked_up' });
    // El rider llega desde sus trabajos, no desde «Mis solicitudes».
    expect(
      screen.queryByRole('link', { name: 'Volver a Mis solicitudes' }),
    ).not.toBeInTheDocument();
  });

  it('para marcar «Entregada» el rider tiene que escribir el código correcto', async () => {
    const user = userEvent.setup();
    const riderTracking = tracking({ role: 'rider', deliveryCode: null });
    let attempts = 0;
    const fetchMock = mockApi({
      get: json(riderTracking),
      patch: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json(
              {
                error: 'El código de entrega no es correcto. Pídeselo al arrendatario.',
                field: 'code',
              },
              { status: 400 },
            )
          : Response.json({
              ...riderTracking,
              deliveryStatus: 'delivered',
              reservationStatus: 'in_progress',
            });
      },
    });

    renderRoute('/entregas/r1');
    const button = await screen.findByRole('button', { name: 'Marcar como Entregada' });
    const input = screen.getByLabelText('Código de entrega');

    await user.click(button);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe las 6 cifras del código de entrega.',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(calls(fetchMock, 'PATCH')).toHaveLength(0);

    await user.type(input, '111 111');
    await user.click(button);
    expect(
      await screen.findByText('El código de entrega no es correcto. Pídeselo al arrendatario.'),
    ).toBeVisible();
    expect(screen.getByText(/En camino/).closest('li')).toHaveAttribute('aria-current', 'step');

    await user.clear(input);
    await user.type(input, '482193');
    await user.click(button);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Marcar como/ })).not.toBeInTheDocument(),
    );
    expect(JSON.parse(String(calls(fetchMock, 'PATCH')[1][1]?.body))).toEqual({
      status: 'delivered',
      code: '482193',
    });
    expect(screen.getByText('En curso').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('sin rider, «Ya tengo el objeto» pide confirmación y pasa el alquiler a «En curso»', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      get: json(pickupTracking()),
      patch: json(
        pickupTracking({
          deliveryStatus: 'delivered',
          reservationStatus: 'in_progress',
          history: [
            { status: 'delivered', at: '2026-11-25T08:15:00.000Z' },
            { status: 'in_progress', at: '2026-11-25T08:15:00.000Z' },
          ],
        }),
      ),
    });

    renderRoute('/entregas/r1');
    expect(await screen.findByText('Recógela en: Carrer del Sol, 8, 2.º 1.ª')).toBeVisible();
    expect(screen.getByText(/Recoger en casa del propietario/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Ya tengo el objeto' }));
    let dialog = screen.getByRole('dialog', { name: 'Ya tengo el objeto' });
    expect(within(dialog).getByText('¿Ya tienes el objeto? No se puede deshacer')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls(fetchMock, 'PATCH')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Ya tengo el objeto' }));
    dialog = screen.getByRole('dialog', { name: 'Ya tengo el objeto' });
    expect(
      within(dialog).getByText('El alquiler de «Bicicleta de paseo» pasará a «En curso».'),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Sí, ya lo tengo' }));

    expect(await screen.findByRole('button', { name: 'He devuelto el objeto' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.parse(String(calls(fetchMock, 'PATCH')[0][1]?.body))).toEqual({
      status: 'delivered',
    });
    expect(screen.queryByText(/Recógela en/)).not.toBeInTheDocument();
  });

  it('«He devuelto el objeto» finaliza el alquiler, sin «Valorar» por ahora', async () => {
    const user = userEvent.setup();
    const inProgress = pickupTracking({
      deliveryStatus: 'delivered',
      reservationStatus: 'in_progress',
      history: [
        { status: 'delivered', at: '2026-11-25T08:15:00.000Z' },
        { status: 'in_progress', at: '2026-11-25T08:15:00.000Z' },
      ],
    });
    const fetchMock = mockApi({
      get: json(inProgress),
      post: json({
        ...inProgress,
        reservationStatus: 'finished',
        history: [...inProgress.history, { status: 'finished', at: '2026-11-26T18:40:00.000Z' }],
      }),
    });

    renderRoute('/entregas/r1');
    expect(
      await screen.findByText('Cuando se lo hayas devuelto al propietario, márcalo aquí.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'He devuelto el objeto' }));
    const dialog = screen.getByRole('dialog', { name: 'He devuelto el objeto' });
    expect(within(dialog).getByText('¿Has devuelto el objeto? No se puede deshacer')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Sí, lo he devuelto' }));

    expect(await screen.findByText('Alquiler finalizado.')).toBeVisible();
    const [[url]] = calls(fetchMock, 'POST');
    expect(url).toBe('http://localhost:3000/api/reservas/r1/devolucion');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Valorar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Actualizado al momento/)).not.toBeInTheDocument();
  });

  it('si el estado ya ha cambiado (409), lo explica y enseña el actual', async () => {
    const user = userEvent.setup();
    let current = pickupTracking();
    const fetchMock = mockApi({
      get: () => Response.json(current),
      patch: () => {
        current = pickupTracking({ deliveryStatus: 'delivered', reservationStatus: 'in_progress' });
        return Response.json(
          { error: 'Este paso ya no está disponible: el estado ha cambiado.' },
          { status: 409 },
        );
      },
    });

    renderRoute('/entregas/r1');
    await user.click(await screen.findByRole('button', { name: 'Ya tengo el objeto' }));
    await user.click(screen.getByRole('button', { name: 'Sí, ya lo tengo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este paso ya no está disponible: el estado ha cambiado. Te enseñamos el actual.',
    );
    expect(await screen.findByRole('button', { name: 'He devuelto el objeto' })).toBeVisible();
    expect(calls(fetchMock, 'GET')).toHaveLength(2);
  });

  it('otros errores de la acción se enseñan con el mensaje de la API', async () => {
    const user = userEvent.setup();
    mockApi({
      get: json(pickupTracking()),
      patch: () => Response.json({ error: 'No puedes cambiar esta entrega.' }, { status: 403 }),
    });

    renderRoute('/entregas/r1');
    await user.click(await screen.findByRole('button', { name: 'Ya tengo el objeto' }));
    await user.click(screen.getByRole('button', { name: 'Sí, ya lo tengo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No puedes cambiar esta entrega.');
  });

  it.each([404, 403])('con un %s dice que no ha encontrado la entrega', async (status) => {
    mockApi({ get: () => Response.json({ error: 'No encontrada.' }, { status }) });

    renderRoute('/entregas/otra');

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos encontrado esta entrega.');
    expect(screen.getByRole('link', { name: 'Volver a Mis solicitudes' })).toBeVisible();
  });

  it('si la API falla, lo dice', async () => {
    mockApi({ get: () => Response.json({ error: 'Error interno.' }, { status: 500 }) });

    renderRoute('/entregas/r1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos podido cargar la entrega. Inténtalo de nuevo más tarde.',
    );
  });

  it('con la sesión caducada vuelve al login', async () => {
    mockApi({ get: () => Response.json({ error: 'Sesión no válida.' }, { status: 401 }) });

    const { router } = renderRoute('/entregas/r1');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('se actualiza solo cuando llega un cambio de esta reserva por el canal', async () => {
    const stream = sseResponse();
    let current = tracking();
    const fetchMock = mockApi({
      get: () => Response.json(current),
      stream: () => stream.response,
    });

    renderRoute('/entregas/r1');
    await screen.findByText('● Actualizado al momento');

    stream.send('id: b-1\nevent: entrega.estado\ndata: {"reservationId":"otra"}\n\n');
    current = tracking({ deliveryStatus: 'delivered', reservationStatus: 'in_progress' });
    stream.send('id: b-2\nevent: entrega.estado\ndata: {"reservationId":"r1"}\n\n');

    await waitFor(() =>
      expect(screen.getByText('En curso').closest('li')).toHaveAttribute('aria-current', 'step'),
    );
    expect(calls(fetchMock, 'GET')).toHaveLength(2);
    expect(screen.queryByText(/Tu código de entrega/)).not.toBeInTheDocument();

    stream.send('event: resync\ndata: {}\n\n');
    await waitFor(() => expect(calls(fetchMock, 'GET')).toHaveLength(3));
  });

  it('si el canal falla 3 veces seguidas, consulta cada 5 s y lo dice', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = mockApi({
      get: json(tracking()),
      stream: () => new Response(null, { status: 503 }),
    });

    renderRoute('/entregas/r1');
    await screen.findByRole('heading', { name: 'Entrega de Taladro percutor Bosch' });
    await vi.advanceTimersByTimeAsync(3500);

    expect(
      await screen.findByText('○ Sin conexión en tiempo real: se actualiza cada 5 s'),
    ).toBeVisible();
    const before = calls(fetchMock, 'GET').length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls(fetchMock, 'GET').length).toBeGreaterThan(before);
  });
});
