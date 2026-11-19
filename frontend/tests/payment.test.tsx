// Generado con asistencia de IA (Claude)
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RentalItem } from '../src/components/RentalRequest';
import { ReservationCard } from '../src/components/ReservationCard';
import { RentalFlow } from './rentalFlow';
import { AuthContext } from '../src/context/authContextValue';
import {
  CARD_ERRORS,
  createPaymentMethod,
  formatCardNumber,
  formatExpiry,
} from '../src/services/cardGateway';
import type { Reservation } from '../src/services/reservationService';
import { renderRoute } from './renderRoute';

// US-07.01 Registrar un pago, frontend (#286), con la propuesta de pagar al solicitar:
// la tarjeta se pide al solicitar, se bloquea el importe y se cobra cuando el propietario acepta.

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u2', username: 'bruno', email: 'bruno@rentit.test', role: 'user' },
};

const VISA = '4242 4242 4242 4242';
const DECLINED = '4000 0000 0000 0002';

const ITEM: RentalItem = {
  id: 'item-1',
  title: 'Taladro percutor Bosch',
  pricePerDay: 6,
  deposit: 40,
  ownerName: 'ana',
};

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    item: { id: 'item-1', title: 'Taladro percutor Bosch' },
    startDate: '2026-11-04',
    endDate: '2026-11-06',
    totalPrice: '18.00',
    deposit: '40.00',
    deliveryAmount: '0.00',
    expiresAt: '2026-11-03T12:30:00.000Z',
    status: 'pending',
    renter: { id: 'u2', username: 'bruno' },
    owner: { id: 'u1', username: 'ana' },
    createdAt: '2026-11-01T12:30:00.000Z',
    // Valorar (US-08.01): una solicitud recién hecha aún no tiene valoración.
    myRating: null,
    ...overrides,
  };
}

type Handler = () => Response | Promise<Response>;

// La disponibilidad siempre está libre; el POST /reservas lo responde `onRequest`.
function mockRequestApi(onRequest: Handler = () => Response.json(reservation(), { status: 201 })) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    String(input).includes('/reservas/disponibilidad')
      ? Response.json({ available: true })
      : String(input).includes('/entrega?')
        ? Response.json({
            modes: { home: true, rider: false, pickupPoint: false },
            pickupPoints: [],
            slots: [],
          })
        : onRequest(),
  );
}

function renderRequest(item: RentalItem = ITEM) {
  const onRequested = vi.fn();
  render(
    <AuthContext.Provider value={{ session: SESSION, saveSession: vi.fn(), clearSession: vi.fn() }}>
      <RentalFlow item={item} onRequested={onRequested} onSessionExpired={vi.fn()} />
    </AuthContext.Provider>,
  );
  return { onRequested };
}

// Elige del 4 al 6 de noviembre y pasa al resumen con la tarjeta.
async function goToSummary(
  user: ReturnType<typeof userEvent.setup>,
  startDate = '04/11/2026',
  endDate = '06/11/2026',
) {
  fireEvent.change(screen.getByLabelText('Fecha de inicio'), { target: { value: startDate } });
  fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: endDate } });
  const request = screen.getByRole('button', { name: 'Solicitar alquiler' });
  await waitFor(() => expect(request).toBeEnabled());
  await user.click(request);
  // Paso «Entrega» (US-05.01): recoger en casa del propietario.
  await user.click(await screen.findByRole('radio', { name: 'Recoger en casa del propietario' }));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
}

function fillCard(number = VISA, expiry = '12/30', cvc = '123') {
  fireEvent.change(screen.getByLabelText('Número de tarjeta'), { target: { value: number } });
  fireEvent.change(screen.getByLabelText('Caducidad'), { target: { value: expiry } });
  fireEvent.change(screen.getByLabelText('CVC'), { target: { value: cvc } });
}

function postCalls(fetchMock: ReturnType<typeof mockRequestApi>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
}

beforeEach(() => {
  // Solo se finge la fecha: «hoy» es el 1 de noviembre de 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 1, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
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
      confirmationTokenId: 'ctoken_simulado',
    });
    expect(createPaymentMethod({ ...card, number: DECLINED })).toEqual({
      ok: true,
      confirmationTokenId: 'ctoken_declined',
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

describe('Pagar al solicitar desde la ficha', () => {
  it('antes de pagar destaca el total sin fianza y enseña aparte la fianza y el total con ella', async () => {
    mockRequestApi();
    const user = userEvent.setup();
    renderRequest();

    await goToSummary(user);

    expect(screen.getByRole('heading', { name: 'Tu solicitud' })).toBeInTheDocument();
    const summary = document.querySelector('.rental-summary') as HTMLElement;
    expect(summary).toHaveTextContent(/Importe del alquiler \(3 días\)\s*18,00\s€/);
    expect(summary).not.toHaveTextContent(/Fianza/);
    // Lo destacado es lo que se paga ahora: sin la fianza.
    expect(document.querySelector('.rental-total')).toHaveTextContent(/^18,00\s€$/);
    const deposit = document.querySelector('.checkout-deposit') as HTMLElement;
    expect(deposit).toHaveTextContent(/Fianza \(se retiene, no se cobra\)\s*40,00\s€/);
    expect(deposit).toHaveTextContent(/Total con fianza\s*58,00\s€/);
    expect(screen.getByText(/Bloquearemos 18,00\s€ en tu tarjeta/)).toBeInTheDocument();
    expect(screen.getByText('Solo se cobran si ana acepta')).toBeInTheDocument();
    expect(
      screen.getByText(
        /La fianza \(40,00\s€\) se bloquea el día antes de empezar y se libera al terminar, sin cobrarla\./,
      ),
    ).toBeInTheDocument();
    // Indica qué tarjetas de prueba usar.
    expect(screen.getByText(VISA)).toBeInTheDocument();
    expect(screen.getByText(DECLINED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar y enviar solicitud' })).toBeEnabled();
  });

  // Un bloqueo con tarjeta caduca a los ~7 días: con más de 6 días de alquiler, la fianza se cobra
  // y se devuelve al terminar.
  it.each([
    [
      '6 días: se bloquea',
      '09/11/2026',
      'Fianza (se retiene, no se cobra)',
      /se bloquea el día antes/,
    ],
    [
      '8 días: se cobra y se devuelve',
      '11/11/2026',
      'Fianza (se cobra y se devuelve al terminar)',
      /Como el alquiler dura más de 6 días, la fianza \(40,00\s€\) se cobra el día antes de empezar y se devuelve al terminar\./,
    ],
  ])('con %s', async (_label, endDate, depositLabel, note) => {
    mockRequestApi();
    const user = userEvent.setup();
    renderRequest();

    await goToSummary(user, '04/11/2026', endDate);

    expect(screen.getByText(depositLabel)).toBeInTheDocument();
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it('envía la solicitud con el método de pago, nunca con el número de la tarjeta', async () => {
    const fetchMock = mockRequestApi();
    const user = userEvent.setup();
    const { onRequested } = renderRequest();

    await goToSummary(user);
    fillCard();
    await user.click(screen.getByRole('button', { name: 'Confirmar y enviar solicitud' }));

    await waitFor(() => expect(onRequested).toHaveBeenCalledWith(reservation()));
    const [post] = postCalls(fetchMock);
    const body = String((post[1] as RequestInit).body);
    expect(JSON.parse(body)).toEqual({
      itemId: 'item-1',
      startDate: '2026-11-04',
      endDate: '2026-11-06',
      deliveryMode: 'home',
      confirmationTokenId: 'ctoken_simulado',
    });
    expect(body).not.toContain('4242');
  });

  it('con datos de tarjeta no válidos no llama a la API y marca los campos', async () => {
    const fetchMock = mockRequestApi();
    const user = userEvent.setup();
    renderRequest();

    await goToSummary(user);
    fillCard('1234', '99', '1');
    await user.click(screen.getByRole('button', { name: 'Confirmar y enviar solicitud' }));

    expect(screen.getByLabelText('Número de tarjeta')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(CARD_ERRORS.number)).toBeInTheDocument();
    expect(screen.getByText(CARD_ERRORS.expiry)).toBeInTheDocument();
    expect(screen.getByText(CARD_ERRORS.cvc)).toBeInTheDocument();
    expect(postCalls(fetchMock)).toHaveLength(0);
    // El foco va al primer campo con error.
    expect(screen.getByLabelText('Número de tarjeta')).toHaveFocus();
  });

  it('si solo falla la caducidad, el foco va a la caducidad', async () => {
    mockRequestApi();
    const user = userEvent.setup();
    renderRequest();

    await goToSummary(user);
    fillCard(VISA, '13/30');
    await user.click(screen.getByRole('button', { name: 'Confirmar y enviar solicitud' }));

    expect(screen.getByLabelText('Caducidad')).toHaveFocus();
  });

  it('si la tarjeta se rechaza, se queda en el resumen con el error y puede reintentar', async () => {
    mockRequestApi(() =>
      Response.json(
        { error: 'Tu tarjeta ha sido rechazada.', field: 'confirmationTokenId' },
        { status: 402 },
      ),
    );
    const user = userEvent.setup();
    const { onRequested } = renderRequest();

    await goToSummary(user);
    fillCard(DECLINED);
    await user.click(screen.getByRole('button', { name: 'Confirmar y enviar solicitud' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tu tarjeta ha sido rechazada.');
    // Sale justo encima de los botones, donde se mira al pulsar.
    expect(alert.nextElementSibling).toContainElement(
      screen.getByRole('button', { name: 'Confirmar y enviar solicitud' }),
    );
    expect(screen.getByRole('heading', { name: 'Tu solicitud' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar y enviar solicitud' })).toBeEnabled();
    expect(onRequested).not.toHaveBeenCalled();
  });

  it('sin fianza no hay bloque de fianza: el total es el alquiler', async () => {
    mockRequestApi();
    const user = userEvent.setup();
    renderRequest({ ...ITEM, deposit: 0 });

    await goToSummary(user);

    expect(screen.queryByText(/Fianza/)).not.toBeInTheDocument();
    expect(document.querySelector('.checkout-deposit')).toBeNull();
    expect(document.querySelector('.rental-total')).toHaveTextContent(/18,00\s€/);
  });

  it('con una fianza de menos de 0,50 € no hay pago de fianza: Stripe no puede retenerla', async () => {
    mockRequestApi();
    const user = userEvent.setup();
    renderRequest({ ...ITEM, deposit: 0.3 });

    await goToSummary(user);

    expect(screen.queryByText(/Fianza/)).not.toBeInTheDocument();
    expect(document.querySelector('.rental-total')).toHaveTextContent(/18,00\s€/);
  });
});

describe('Ficha y «Mis solicitudes» con el pago al solicitar', () => {
  const ITEM_DETAIL = {
    id: 'item-1',
    title: 'Taladro percutor Bosch',
    description: 'Taladro de 750 W.',
    dailyPrice: '6.00',
    deposit: '40.00',
    status: 'published',
    neighborhood: 'Gràcia',
    category: { id: 'c1', name: 'Herramientas' },
    photos: [],
    homeDelivery: true,
    riderDelivery: false,
    pickupPointDelivery: false,
    owner: { id: 'u1', username: 'ana' },
    createdAt: '2026-10-01T10:00:00.000Z',
  };

  it('al enviar la solicitud desde la ficha, «Mis solicitudes» la muestra pendiente con el importe bloqueado', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/reservas/disponibilidad')) return Response.json({ available: true });
      if (url.includes('/entrega?'))
        return Response.json({
          modes: { home: true, rider: false, pickupPoint: false },
          pickupPoints: [],
          slots: [],
        });
      if (init?.method === 'POST') return Response.json(reservation(), { status: 201 });
      if (url.endsWith('/usuarios/me/reservas')) {
        return Response.json({ sent: [reservation()], received: [] });
      }
      return Response.json(ITEM_DETAIL);
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/objetos/item-1');

    await screen.findByRole('complementary', { name: 'Alquiler de este objeto' });
    await goToSummary(user);
    fillCard();
    await user.click(screen.getByRole('button', { name: 'Confirmar y enviar solicitud' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/mis-solicitudes'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Solicitud enviada. Hemos bloqueado el importe hasta que ana responda.',
    );
    expect(await screen.findByRole('button', { name: /Taladro percutor Bosch/ })).toHaveTextContent(
      'Pendiente',
    );
  });

  it('ya no hay botón «Pagar»: una solicitud pendiente dice cuánto hay bloqueado y hasta cuándo', () => {
    render(
      <MemoryRouter>
        <ReservationCard reservation={reservation()} role="sent" />
        <ReservationCard
          reservation={reservation({ id: 'r2', item: { id: 'i2', title: 'Escalera' } })}
          role="received"
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /Pagar/, hidden: true })).not.toBeInTheDocument();
    const [sent, received] = screen.getAllByRole('article');
    expect(sent).toHaveTextContent(
      /Hemos bloqueado 18,00\s€ en tu tarjeta\. Se cobran si ana acepta; si no, se liberan\. Tiene hasta el 3 de noviembre a las \d{2}:30 para responder\./,
    );
    expect(received).toHaveTextContent(
      /Si la aceptas, se cobran 18,00\s€ al momento; si la rechazas, se liberan\. Responde antes del 3 de noviembre a las \d{2}:30: si no, caduca\./,
    );
  });

  // Bug #372: con rider se bloquea alquiler + tarifa, y eso es lo que tiene que decir la tarjeta.
  it('con entrega por rider, el importe bloqueado incluye la tarifa del rider', () => {
    const delivery = {
      mode: 'rider' as const,
      slot: null,
      pickupPoint: null,
      fee: '5.00',
      deliveryNeighborhood: 'Sants',
      deliveryAddress: null,
      ownerAddress: null,
    };
    render(
      <MemoryRouter>
        <ReservationCard reservation={reservation({ delivery })} role="sent" />
        <ReservationCard
          reservation={reservation({ id: 'r2', item: { id: 'i2', title: 'Escalera' }, delivery })}
          role="received"
        />
      </MemoryRouter>,
    );

    const [sent, received] = screen.getAllByRole('article');
    expect(sent).toHaveTextContent(/Hemos bloqueado 23,00\s€ en tu tarjeta\./);
    expect(received).toHaveTextContent(/Si la aceptas, se cobran 23,00\s€ al momento;/);
  });

  it('una pendiente del flujo anterior, sin plazo, no dice que haya nada bloqueado', () => {
    render(
      <MemoryRouter>
        <ReservationCard reservation={reservation({ expiresAt: null })} role="sent" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('article')).not.toHaveTextContent(/Hemos bloqueado/);
  });

  it('una solicitud caducada lo dice y explica que se ha liberado el importe', () => {
    render(
      <MemoryRouter>
        <ReservationCard reservation={reservation({ status: 'expired' })} role="sent" />
      </MemoryRouter>,
    );

    const card = screen.getByRole('article');
    expect(within(card).getByRole('button', { name: /Taladro percutor Bosch/ })).toHaveTextContent(
      'Caducada',
    );
    expect(card).toHaveTextContent(
      'ana no respondió a tiempo. Hemos liberado el importe bloqueado.',
    );
  });

  it('al aceptar una solicitud se cobra y queda «Pagada»', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') return Response.json({ id: 'r1', status: 'paid' });
      return Response.json({ sent: [], received: [reservation()] });
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await user.click(await screen.findByRole('button', { name: /Taladro percutor Bosch/ }));
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Has aceptado la solicitud. Se ha cobrado el alquiler.',
    );
    expect(screen.getByRole('button', { name: /Taladro percutor Bosch/ })).toHaveTextContent(
      'Pagada',
    );
  });
});
