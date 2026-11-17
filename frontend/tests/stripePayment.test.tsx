// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RentalRequest, type RentalItem } from '../src/components/RentalRequest';
import { AuthContext } from '../src/context/authContextValue';
import type { Reservation } from '../src/services/reservationService';

// Pago con Stripe (Payment Element) y 3D Secure en dos pasos (US-07.01, T10 #285), con Stripe
// simulado: sin red, sin claves.

const state = vi.hoisted(() => ({ enabled: true }));

const stripe = vi.hoisted(() => ({
  createConfirmationToken: vi.fn(),
  handleNextAction: vi.fn(),
}));
const elements = vi.hoisted(() => ({ submit: vi.fn() }));
const elementsOptions = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('../src/services/stripeService', () => ({
  isStripeEnabled: () => state.enabled,
  getStripePromise: () => Promise.resolve(null),
}));

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children, options }: { children: ReactNode; options: unknown }) => {
    elementsOptions.current = options;
    return <>{children}</>;
  },
  PaymentElement: ({ options }: { options?: { readOnly?: boolean } }) => (
    <div data-testid="payment-element" data-readonly={String(options?.readOnly)} />
  ),
  useStripe: () => stripe,
  useElements: () => elements,
}));

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u2', username: 'bruno', email: 'bruno@rentit.test', role: 'user' },
};

const ITEM: RentalItem = {
  id: 'item-1',
  title: 'Taladro percutor Bosch',
  pricePerDay: 6,
  deposit: 40,
  ownerName: 'ana',
};

const RESERVATION: Reservation = {
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
};

const THREE_DS = {
  error: 'Tu banco pide verificar el pago.',
  field: 'confirmationTokenId',
  requiresAction: true,
  clientSecret: 'pi_1_secret_x',
  paymentIntentId: 'pi_1',
};

type Handler = (body: Record<string, unknown>) => Response;

function mockApi(onPost: Handler) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).includes('/reservas/disponibilidad')) {
      return Response.json({ available: true });
    }
    return onPost(JSON.parse(String(init?.body)) as Record<string, unknown>);
  });
}

function postBodies(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

function renderRequest() {
  const onRequested = vi.fn();
  render(
    <AuthContext.Provider value={{ session: SESSION, saveSession: vi.fn(), clearSession: vi.fn() }}>
      <RentalRequest item={ITEM} onRequested={onRequested} onSessionExpired={vi.fn()} />
    </AuthContext.Provider>,
  );
  return { onRequested };
}

async function goToSummary(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText('Fecha de inicio'), { target: { value: '04/11/2026' } });
  fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: '06/11/2026' } });
  const request = screen.getByRole('button', { name: 'Solicitar alquiler' });
  await waitFor(() => expect(request).toBeEnabled());
  await user.click(request);
}

const submitButton = () => screen.getByRole('button', { name: 'Enviar solicitud' });

beforeEach(() => {
  state.enabled = true;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 1, 12, 0));
  elements.submit.mockResolvedValue({});
  stripe.createConfirmationToken.mockResolvedValue({ confirmationToken: { id: 'ctoken_real' } });
  stripe.handleNextAction.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  stripe.createConfirmationToken.mockReset();
  stripe.handleNextAction.mockReset();
  elements.submit.mockReset();
});

describe('Payment Element de Stripe', () => {
  it('con clave publicable enseña el Payment Element en modo deferred intent y la nota de pruebas', async () => {
    mockApi(() => Response.json(RESERVATION, { status: 201 }));
    const user = userEvent.setup();
    renderRequest();

    await goToSummary(user);

    expect(screen.getByTestId('payment-element')).toBeInTheDocument();
    expect(screen.queryByLabelText('Número de tarjeta')).not.toBeInTheDocument();
    expect(elementsOptions.current).toMatchObject({
      mode: 'payment',
      amount: 1800,
      currency: 'eur',
      captureMethod: 'manual',
      setupFutureUsage: 'off_session',
    });
    expect(screen.getByText('4242 4242 4242 4242')).toBeInTheDocument();
    expect(screen.getByText('4000 0000 0000 0002')).toBeInTheDocument();
  });

  it('envía el confirmationTokenId que da Stripe y crea la solicitud', async () => {
    const fetchMock = mockApi(() => Response.json(RESERVATION, { status: 201 }));
    const user = userEvent.setup();
    const { onRequested } = renderRequest();

    await goToSummary(user);
    await user.click(submitButton());

    await waitFor(() => expect(onRequested).toHaveBeenCalledWith(RESERVATION));
    expect(elements.submit).toHaveBeenCalled();
    expect(stripe.createConfirmationToken).toHaveBeenCalledWith({ elements });
    expect(postBodies(fetchMock)).toEqual([
      {
        itemId: 'item-1',
        startDate: '2026-11-04',
        endDate: '2026-11-06',
        confirmationTokenId: 'ctoken_real',
      },
    ]);
  });

  it('si el formulario de Stripe da un error, sale encima del botón y no se llama a la API', async () => {
    elements.submit.mockResolvedValue({
      error: { message: 'Tu número de tarjeta está incompleto.' },
    });
    const fetchMock = mockApi(() => Response.json(RESERVATION, { status: 201 }));
    const user = userEvent.setup();
    const { onRequested } = renderRequest();

    await goToSummary(user);
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tu número de tarjeta está incompleto.');
    expect(alert.nextElementSibling).toContainElement(submitButton());
    expect(postBodies(fetchMock)).toHaveLength(0);
    expect(onRequested).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it('si la tarjeta se rechaza, no se crea la reserva y se puede reintentar', async () => {
    mockApi(() =>
      Response.json(
        { error: 'Tu tarjeta ha sido rechazada.', field: 'confirmationTokenId' },
        { status: 402 },
      ),
    );
    const user = userEvent.setup();
    const { onRequested } = renderRequest();

    await goToSummary(user);
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu tarjeta ha sido rechazada.');
    expect(onRequested).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it('deshabilita el botón y el formulario mientras se procesa el pago', async () => {
    let respond: (response: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
      String(input).includes('/reservas/disponibilidad')
        ? Promise.resolve(Response.json({ available: true }))
        : new Promise<Response>((resolve) => (respond = resolve)),
    );
    const user = userEvent.setup();
    renderRequest();

    await goToSummary(user);
    await user.click(submitButton());

    expect(await screen.findByRole('button', { name: 'Procesando el pago…' })).toBeDisabled();
    expect(screen.getByTestId('payment-element')).toHaveAttribute('data-readonly', 'true');
    respond(Response.json(RESERVATION, { status: 201 }));
  });
});

describe('3D Secure en dos pasos', () => {
  it('con Stripe llama a handleNextAction y repite la solicitud con el paymentIntentId', async () => {
    let calls = 0;
    const fetchMock = mockApi(() =>
      calls++ === 0
        ? Response.json(THREE_DS, { status: 402 })
        : Response.json(RESERVATION, { status: 201 }),
    );
    const user = userEvent.setup();
    const { onRequested } = renderRequest();

    await goToSummary(user);
    await user.click(submitButton());

    await waitFor(() => expect(onRequested).toHaveBeenCalledWith(RESERVATION));
    expect(stripe.handleNextAction).toHaveBeenCalledWith({ clientSecret: 'pi_1_secret_x' });
    expect(postBodies(fetchMock)).toEqual([
      expect.objectContaining({ confirmationTokenId: 'ctoken_real' }),
      {
        itemId: 'item-1',
        startDate: '2026-11-04',
        endDate: '2026-11-06',
        paymentIntentId: 'pi_1',
      },
    ]);
  });

  it('si el usuario no supera la verificación, no se crea la reserva y se muestra el error', async () => {
    stripe.handleNextAction.mockResolvedValue({
      error: { message: 'No hemos podido autenticar tu método de pago.' },
    });
    const fetchMock = mockApi(() => Response.json(THREE_DS, { status: 402 }));
    const user = userEvent.setup();
    const { onRequested } = renderRequest();

    await goToSummary(user);
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos podido autenticar tu método de pago.',
    );
    expect(postBodies(fetchMock)).toHaveLength(1);
    expect(onRequested).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it('un 409 del segundo paso se enseña como error del pago, sin volver a las fechas', async () => {
    let calls = 0;
    mockApi(() =>
      calls++ === 0
        ? Response.json(THREE_DS, { status: 402 })
        : Response.json(
            {
              error: 'El pago no corresponde a esta solicitud. Vuelve a intentarlo.',
              field: 'paymentIntentId',
            },
            { status: 409 },
          ),
    );
    const user = userEvent.setup();
    renderRequest();

    await goToSummary(user);
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('El pago no corresponde');
    expect(screen.getByRole('heading', { name: 'Revisa tu solicitud' })).toBeInTheDocument();
  });
});

describe('Sin VITE_STRIPE_PUBLISHABLE_KEY (modo simulado)', () => {
  beforeEach(() => {
    state.enabled = false;
  });

  it('mantiene los campos de la tarjeta simulada y no carga el Payment Element', async () => {
    mockApi(() => Response.json(RESERVATION, { status: 201 }));
    const user = userEvent.setup();
    renderRequest();

    await goToSummary(user);

    expect(screen.getByLabelText('Número de tarjeta')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument();
  });

  it('la tarjeta de 3D Secure repite la solicitud con el paymentIntentId, sin Stripe', async () => {
    let calls = 0;
    const fetchMock = mockApi(() =>
      calls++ === 0
        ? Response.json(THREE_DS, { status: 402 })
        : Response.json(RESERVATION, { status: 201 }),
    );
    const user = userEvent.setup();
    const { onRequested } = renderRequest();

    await goToSummary(user);
    fireEvent.change(screen.getByLabelText('Número de tarjeta'), {
      target: { value: '4000 0027 6000 3184' },
    });
    fireEvent.change(screen.getByLabelText('Caducidad'), { target: { value: '12/30' } });
    fireEvent.change(screen.getByLabelText('CVC'), { target: { value: '123' } });
    await user.click(submitButton());

    await waitFor(() => expect(onRequested).toHaveBeenCalledWith(RESERVATION));
    expect(stripe.handleNextAction).not.toHaveBeenCalled();
    expect(postBodies(fetchMock)).toEqual([
      expect.objectContaining({ confirmationTokenId: 'ctoken_3ds' }),
      expect.objectContaining({ paymentIntentId: 'pi_1' }),
    ]);
  });
});
