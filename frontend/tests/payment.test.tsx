// Generado con asistencia de IA (Claude)
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_ERRORS,
  createPaymentMethod,
  formatCardNumber,
  formatExpiry,
} from '../src/services/cardGateway';
import type { Reservation } from '../src/services/reservationService';
import { renderRoute } from './renderRoute';

// US-07.01 Registrar un pago, frontend (#286): criterios de aceptación de la historia (#72).

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u2', username: 'bruno', email: 'bruno@rentit.test', role: 'user' },
};

const VISA = '4242 4242 4242 4242';
const DECLINED = '4000 0000 0000 0002';

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    item: { id: 'item-1', title: 'Taladro percutor Bosch' },
    startDate: '2026-12-10',
    endDate: '2026-12-12',
    totalPrice: '18.00',
    status: 'accepted',
    renter: { id: 'u2', username: 'bruno' },
    owner: { id: 'u1', username: 'ana' },
    createdAt: '2026-11-01T12:00:00.000Z',
    ...overrides,
  };
}

const ITEM = {
  id: 'item-1',
  title: 'Taladro percutor Bosch',
  description: 'Taladro de 750 W.',
  dailyPrice: '6.00',
  deposit: '40.00',
  status: 'published',
  neighborhood: 'Gràcia',
  category: { id: 'c1', name: 'Herramientas' },
  photos: [],
  homeDelivery: false,
  riderDelivery: false,
  pickupPointDelivery: true,
  owner: { id: 'u1', username: 'ana' },
};

type Reply = Response | (() => Response);

// Responde según el método y el final de la URL; guarda las peticiones para comprobarlas.
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

async function fillCard(number: string, expiry = '12/30', cvc = '123') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Número de tarjeta'), number);
  await user.type(screen.getByLabelText('Caducidad'), expiry);
  await user.type(screen.getByLabelText('CVC'), cvc);
  return user;
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Tarjeta en modo de prueba (provisional hasta Stripe Elements, T10)', () => {
  it('da formato al número y a la caducidad mientras se escriben', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('4242-42')).toBe('4242 42');
    expect(formatExpiry('1230')).toBe('12/30');
    expect(formatExpiry('1')).toBe('1');
  });

  it('convierte las tarjetas de prueba en los métodos de pago de prueba de Stripe', () => {
    const card = { expiry: '12/30', cvc: '123' };
    expect(createPaymentMethod({ ...card, number: VISA })).toEqual({
      ok: true,
      paymentMethodId: 'pm_card_visa',
    });
    expect(createPaymentMethod({ ...card, number: DECLINED })).toEqual({
      ok: true,
      paymentMethodId: 'pm_card_chargeDeclined',
    });
  });

  it('valida el número, la caducidad y el CVC sin llamar a nadie', () => {
    const today = new Date(2026, 10, 13);
    expect(
      createPaymentMethod({ number: '4242 4242 4242 4241', expiry: '13/30', cvc: '1' }, today),
    ).toEqual({
      ok: false,
      errors: { number: CARD_ERRORS.number, expiry: CARD_ERRORS.expiry, cvc: CARD_ERRORS.cvc },
    });
    // Caduca a final de mes: octubre de 2026 ya no vale, noviembre todavía sí.
    expect(createPaymentMethod({ number: VISA, expiry: '10/26', cvc: '123' }, today)).toEqual({
      ok: false,
      errors: { expiry: CARD_ERRORS.expired },
    });
    expect(createPaymentMethod({ number: VISA, expiry: '11/26', cvc: '123' }, today).ok).toBe(true);
  });

  it('una tarjeta real (válida pero no de prueba) no se acepta', () => {
    expect(
      createPaymentMethod({ number: '5555 5555 5555 4444', expiry: '12/30', cvc: '123' }),
    ).toEqual({ ok: false, errors: { number: CARD_ERRORS.testOnly } });
  });
});

describe('«Pagar» en Mis solicitudes (criterio 1)', () => {
  it('solo aparece en una solicitud enviada y aceptada, y lleva a la pantalla de pago', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({
        sent: [
          reservation(),
          reservation({
            id: 'r2',
            item: { id: 'i2', title: 'Tienda de campaña' },
            status: 'pending',
          }),
          reservation({ id: 'r3', item: { id: 'i3', title: 'Escalera' }, status: 'paid' }),
        ],
        received: [
          reservation({ id: 'r4', item: { id: 'i4', title: 'Bicicleta' }, status: 'accepted' }),
        ],
      }),
    });

    renderRoute('/mis-solicitudes');

    await screen.findByRole('button', { name: /Taladro percutor Bosch/ });
    const payLinks = screen.getAllByRole('link', { name: /^Pagar/, hidden: true });
    expect(payLinks).toHaveLength(1);
    expect(payLinks[0]).toHaveAccessibleName('Pagar el alquiler de Taladro percutor Bosch');
    expect(payLinks[0]).toHaveAttribute('href', '/mis-solicitudes/r1/pagar');
  });
});

describe('Pantalla de pago (US-07.01, #286)', () => {
  it('muestra el objeto, las fechas, el alquiler, la fianza y el importe total (criterio 2)', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /objetos/item-1': Response.json(ITEM),
    });

    renderRoute('/mis-solicitudes/r1/pagar');

    const summary = await screen.findByRole('region', { name: 'Resumen' });
    expect(within(summary).getByRole('link', { name: 'Taladro percutor Bosch' })).toHaveAttribute(
      'href',
      '/objetos/item-1',
    );
    expect(summary).toHaveTextContent('Del 10 de diciembre de 2026 al 12 de diciembre de 2026');
    expect(summary).toHaveTextContent(/Precio del alquiler\s*3 días\s*18,00\s€/);
    expect(summary).toHaveTextContent(/Fianza\s*Se retiene, no se cobra\s*40,00\s€/);
    expect(summary).toHaveTextContent(/Importe total\s*58,00\s€/);
    expect(summary).toHaveTextContent(/Ahora se cobran 18,00\s€/);
    expect(within(summary).queryByText('Entrega')).not.toBeInTheDocument();
    // Criterio 3: indica qué tarjetas de prueba usar.
    expect(screen.getByText(VISA)).toBeInTheDocument();
    expect(screen.getByText(DECLINED)).toBeInTheDocument();
  });

  it('con entrega, la suma al importe total', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({
        sent: [reservation({ deliveryAmount: '4.50' })],
        received: [],
      }),
      'GET /objetos/item-1': Response.json({ ...ITEM, deposit: '0.00' }),
    });

    renderRoute('/mis-solicitudes/r1/pagar');

    const summary = await screen.findByRole('region', { name: 'Resumen' });
    expect(summary).toHaveTextContent(/Entrega\s*4,50\s€/);
    expect(summary).toHaveTextContent(/Fianza\s*Sin fianza/);
    expect(summary).toHaveTextContent(/Importe total\s*22,50\s€/);
  });

  it('con una tarjeta válida paga y vuelve a Mis solicitudes con la reserva «Pagada» (criterio 4)', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /usuarios/me/reservas': [
        Response.json({ sent: [reservation()], received: [] }),
        Response.json({ sent: [reservation({ status: 'paid' })], received: [] }),
      ],
      'GET /objetos/item-1': Response.json(ITEM),
      'POST /reservas/r1/pago': Response.json(reservation({ status: 'paid' })),
    });

    const { router } = renderRoute('/mis-solicitudes/r1/pagar');
    const user = await fillCard(VISA);
    await user.click(screen.getByRole('button', { name: 'Pagar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/mis-solicitudes'));
    expect(await screen.findByRole('status')).toHaveTextContent('Pago registrado.');
    expect(await screen.findByRole('button', { name: /Taladro percutor Bosch/ })).toHaveTextContent(
      'Pagada',
    );

    const payment = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(payment?.[1]?.body))).toEqual({ paymentMethodId: 'pm_card_visa' });
    expect(new Headers(payment?.[1]?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
    // El número de la tarjeta nunca sale hacia nuestra API.
    expect(String(payment?.[1]?.body)).not.toContain('4242');
  });

  it('mientras se procesa, el botón está desactivado', async () => {
    logIn();
    let finish: (response: Response) => void = () => undefined;
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /objetos/item-1': Response.json(ITEM),
      'POST /reservas/r1/pago': () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }) as unknown as Response,
    });

    renderRoute('/mis-solicitudes/r1/pagar');
    const user = await fillCard(VISA);
    await user.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('button', { name: 'Procesando el pago…' })).toBeDisabled();
    expect(screen.getByLabelText('Número de tarjeta')).toBeDisabled();
    finish(Response.json(reservation({ status: 'paid' })));
  });

  it('si la tarjeta es rechazada, se queda en la pantalla con el error y puede reintentar (criterio 5)', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /objetos/item-1': Response.json(ITEM),
      'POST /reservas/r1/pago': Response.json(
        { error: 'Tu tarjeta ha sido rechazada.', field: 'paymentMethodId' },
        { status: 402 },
      ),
    });

    const { router } = renderRoute('/mis-solicitudes/r1/pagar');
    const user = await fillCard(DECLINED);
    await user.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu tarjeta ha sido rechazada.');
    expect(router.state.location.pathname).toBe('/mis-solicitudes/r1/pagar');
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeEnabled();
  });

  it('con datos de tarjeta no válidos no llama a la API y marca los campos', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /objetos/item-1': Response.json(ITEM),
    });

    renderRoute('/mis-solicitudes/r1/pagar');
    const user = await fillCard('1234', '99', '1');
    await user.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(screen.getByLabelText('Número de tarjeta')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(CARD_ERRORS.number)).toBeInTheDocument();
    expect(screen.getByText(CARD_ERRORS.expiry)).toBeInTheDocument();
    expect(screen.getByText(CARD_ERRORS.cvc)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it.each([
    ['pagada', 'paid', 'Esta reserva ya está pagada.'],
    ['pendiente', 'pending', 'Solo se puede pagar una solicitud aceptada.'],
  ] as const)(
    'una solicitud %s no pide el pago (criterios 1 y 6)',
    async (_label, status, message) => {
      logIn();
      mockApi({
        'GET /usuarios/me/reservas': Response.json({
          sent: [reservation({ status })],
          received: [],
        }),
      });

      renderRoute('/mis-solicitudes/r1/pagar');

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByLabelText('Número de tarjeta')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Volver a Mis solicitudes' })).toHaveAttribute(
        'href',
        '/mis-solicitudes',
      );
    },
  );

  it('una solicitud recibida o que no existe no se puede pagar', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [], received: [reservation()] }),
    });

    renderRoute('/mis-solicitudes/r1/pagar');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos encontrado esta solicitud.',
    );
  });

  it('si al pagar ya estaba pagada (otra pestaña), no deja volver a pagar', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /objetos/item-1': Response.json(ITEM),
      'POST /reservas/r1/pago': Response.json(
        { error: 'Esta reserva ya está pagada.' },
        { status: 409 },
      ),
    });

    renderRoute('/mis-solicitudes/r1/pagar');
    const user = await fillCard(VISA);
    await user.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta reserva ya está pagada.');
    expect(screen.queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument();
  });

  it('sin sesión lleva al login', async () => {
    const { router } = renderRoute('/mis-solicitudes/r1/pagar');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('si la sesión ha caducado, la borra y lleva al login', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ error: 'Sesión caducada.' }, { status: 401 }),
    });

    const { router } = renderRoute('/mis-solicitudes/r1/pagar');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(localStorage.getItem('rentit.session')).toBeNull();
  });

  it('si no se puede cargar, lo dice', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ error: 'Error' }, { status: 500 }),
    });

    renderRoute('/mis-solicitudes/r1/pagar');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos podido cargar el pago. Inténtalo de nuevo más tarde.',
    );
  });
});
