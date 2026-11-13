// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Paso «Entrega» de la solicitud de alquiler (US-05.01, #282). Wireframe: pantallas 2 a 8 de
// docs/wireframes/US-05.01-modo-entrega.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RentalRequest, type RentalItem } from '../src/components/RentalRequest';
import { AuthContext } from '../src/context/authContextValue';
import {
  formatDistance,
  formatSlot,
  getDeliveryOptions,
  getNeighborhoods,
  getRiderQuote,
  type DeliveryOptions,
} from '../src/services/deliveryService';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const ITEM: RentalItem = {
  id: 'item-1',
  title: 'Taladro percutor Bosch',
  pricePerDay: 6,
  neighborhood: 'Gràcia',
};

const RENTAL = {
  id: 'reserva-1',
  item: { id: 'item-1', title: 'Taladro percutor Bosch' },
  startDate: '2026-11-18',
  endDate: '2026-11-20',
  totalPrice: '18.00',
  status: 'pending' as const,
  renter: { id: 'u1', username: 'ana' },
  owner: { id: 'u2', username: 'bruno' },
  createdAt: '2026-11-13T12:00:00.000Z',
  delivery: null,
};

const ALL_MODES: DeliveryOptions = {
  modes: { home: true, rider: true, pickupPoint: true },
  pickupPoints: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Biblioteca Jaume Fuster',
      address: 'Plaça de Lesseps, 20-22',
      neighborhood: 'Vallcarca i els Penitents',
      distanceKm: 1.1,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Mercat de Sant Antoni',
      address: "Carrer del Comte d'Urgell, 1",
      neighborhood: 'Sant Antoni',
      distanceKm: 2.5,
    },
  ],
  slots: ['09:00-11:00', '11:00-13:00'],
};

const NEIGHBORHOODS = ['Gràcia', 'Sants', 'Sant Antoni'];

type Routes = {
  options?: () => Response;
  quote?: () => Response;
  neighborhoods?: () => Response;
  post?: () => Response;
};

// Responde a cada endpoint de la entrega y a POST /reservas; disponibilidad siempre libre.
function mockFetch(routes: Routes = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/reservas/disponibilidad')) return Response.json({ available: true });
    if (url.includes('/entrega/tarifa')) {
      return routes.quote?.() ?? Response.json({ distanceKm: 3.2, fee: '5.00' });
    }
    if (url.includes('/entrega?')) return routes.options?.() ?? Response.json(ALL_MODES);
    if (url.endsWith('/barrios')) return routes.neighborhoods?.() ?? Response.json(NEIGHBORHOODS);
    return routes.post?.() ?? Response.json(RENTAL, { status: 201 });
  });
}

function postBody(fetchMock: ReturnType<typeof mockFetch>) {
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  return post ? JSON.parse(String(post[1]?.body)) : undefined;
}

function renderRentalRequest() {
  const onRequested = vi.fn();
  render(
    <AuthContext.Provider value={{ session: SESSION, saveSession: vi.fn(), clearSession: vi.fn() }}>
      <RentalRequest item={ITEM} onRequested={onRequested} onSessionExpired={vi.fn()} />
    </AuthContext.Provider>,
  );
  return { onRequested };
}

// Elige del 18 al 20 de noviembre (3 días × 6 € = 18 €) y abre el paso «Entrega».
async function openDeliveryStep(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText('Fecha de inicio'), { target: { value: '18/11/2026' } });
  fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: '20/11/2026' } });
  const request = screen.getByRole('button', { name: 'Solicitar alquiler' });
  await waitFor(() => expect(request).toBeEnabled());
  await user.click(request);
}

function continueButton() {
  return screen.getByRole('button', { name: 'Continuar' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 13, 12, 0));
});

afterEach(() => vi.useRealTimers());

describe('paso «Entrega» (US-05.01, #282)', () => {
  it('después de las fechas pide la entrega con los modos que ofrece el objeto', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderRentalRequest();

    await openDeliveryStep(user);

    expect(screen.getByRole('heading', { name: 'Entrega' })).toHaveFocus();
    expect(screen.getByText('Taladro percutor Bosch · Del 18/11/2026 al 20/11/2026')).toBeVisible();
    const modes = await screen.findByRole('group', { name: '¿Cómo quieres recibir el objeto?' });
    expect(
      within(modes)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['home', 'rider', 'pickup_point']);
    expect(screen.getByText('Importe del alquiler (3 días): 18,00 €')).toBeVisible();
    const optionsCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/entrega?'));
    expect(String(optionsCall?.[0])).toMatch(/\/objetos\/item-1\/entrega\?startDate=2026-11-18$/);
  });

  it('solo enseña los modos que ofrece el objeto (criterio 2)', async () => {
    mockFetch({
      options: () =>
        Response.json({ ...ALL_MODES, modes: { home: false, rider: false, pickupPoint: true } }),
    });
    const user = userEvent.setup();
    renderRentalRequest();

    await openDeliveryStep(user);

    expect(await screen.findByRole('radio', { name: 'Punto de recogida' })).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  it('mientras carga lo dice, y si falla enseña el error y deja volver a las fechas', async () => {
    let respond: (response: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/reservas/disponibilidad')) return Response.json({ available: true });
      return new Promise<Response>((resolve) => (respond = resolve));
    });
    const user = userEvent.setup();
    renderRentalRequest();

    await openDeliveryStep(user);

    expect(screen.getByText('Cargando…')).toBeVisible();
    respond(Response.json({ error: 'No hemos encontrado este objeto.' }, { status: 404 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos encontrado este objeto.');

    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByRole('heading', { name: 'Elige las fechas' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('18/11/2026');
  });

  it('sin modo elegido no deja continuar (pantalla 3)', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderRentalRequest();

    await openDeliveryStep(user);
    await screen.findByRole('radio', { name: 'Entrega por rider' });
    await user.click(continueButton());

    const modes = screen.getByRole('group', { name: '¿Cómo quieres recibir el objeto?' });
    expect(modes).toHaveAccessibleDescription('Elige un modo de entrega.');
    expect(screen.getByRole('radio', { name: 'Recoger en casa del propietario' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Entrega' })).toBeInTheDocument();
    expect(postBody(fetchMock)).toBeUndefined();

    // Al elegir un modo el error desaparece.
    await user.click(screen.getByRole('radio', { name: 'Punto de recogida' }));
    expect(modes).not.toHaveAccessibleDescription();
  });

  it('recoger en casa avisa de que la dirección llega al aceptar (pantalla 7)', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    const { onRequested } = renderRentalRequest();

    await openDeliveryStep(user);
    await user.click(await screen.findByRole('radio', { name: 'Recoger en casa del propietario' }));

    expect(
      screen.getByText(
        'Lo recoges en Gràcia. La dirección se mostrará cuando acepten la solicitud.',
      ),
    ).toBeVisible();
    expect(screen.getByText(/^Total:/)).toHaveTextContent('Total: 18,00 €');

    await user.click(continueButton());
    const summary = within(screen.getByText('Desde').closest('dl') as HTMLElement);
    expect(summary.getByText('Recoger en casa del propietario')).toBeVisible();
    expect(
      summary.getByText('La dirección se mostrará cuando acepten la solicitud.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(() => expect(onRequested).toHaveBeenCalled());
    expect(postBody(fetchMock)).toEqual({
      itemId: 'item-1',
      startDate: '2026-11-18',
      endDate: '2026-11-20',
      deliveryMode: 'home',
    });
  });
});

describe('entrega por rider (pantallas 4, 5 y 8)', () => {
  it('pide hora, dirección y barrio, suma la tarifa y la envía', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    const { onRequested } = renderRentalRequest();

    await openDeliveryStep(user);
    await user.click(await screen.findByRole('radio', { name: 'Entrega por rider' }));

    const slot = screen.getByLabelText('Hora de entrega (18/11/2026)');
    expect(
      within(slot)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Elige una hora', 'Lo antes posible', '09:00 – 11:00', '11:00 – 13:00']);
    expect(screen.getByText('Elige el barrio para ver el coste.')).toBeVisible();
    expect(screen.getByLabelText('Dirección de entrega')).toHaveAccessibleDescription(
      'Solo la verá el rider que haga la entrega.',
    );

    await user.selectOptions(slot, 'Lo antes posible');
    await user.type(screen.getByLabelText('Dirección de entrega'), 'Carrer de Sants, 140');
    const neighborhood = screen.getByLabelText('Barrio de entrega');
    await waitFor(() => expect(neighborhood).toBeEnabled());
    await user.selectOptions(neighborhood, 'Sants');

    expect(await screen.findByText('Entrega por rider: 5,00 €')).toBeVisible();
    expect(screen.getByText(/^Total:/)).toHaveTextContent('Total: 23,00 €');
    const quoteCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/tarifa'));
    expect(String(quoteCall?.[0])).toMatch(/\/objetos\/item-1\/entrega\/tarifa\?barrio=Sants$/);

    await user.click(continueButton());

    const summary = within(screen.getByText('Desde').closest('dl') as HTMLElement);
    expect(summary.getByText('Entrega por rider · Lo antes posible')).toBeVisible();
    expect(summary.getByText('A: Carrer de Sants, 140 (Sants)')).toBeVisible();
    expect(summary.getByText('5,00 €')).toBeVisible();
    expect(summary.getByText('23,00 €')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(() => expect(onRequested).toHaveBeenCalled());
    expect(postBody(fetchMock)).toEqual({
      itemId: 'item-1',
      startDate: '2026-11-18',
      endDate: '2026-11-20',
      deliveryMode: 'rider',
      slot: 'asap',
      deliveryAddress: 'Carrer de Sants, 140',
      deliveryNeighborhood: 'Sants',
    });
  });

  it('sin hora, dirección ni barrio marca los tres campos y lleva el foco a la hora', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderRentalRequest();

    await openDeliveryStep(user);
    await user.click(await screen.findByRole('radio', { name: 'Entrega por rider' }));
    await waitFor(() => expect(screen.getByLabelText('Barrio de entrega')).toBeEnabled());
    await user.click(continueButton());

    const slot = screen.getByLabelText('Hora de entrega (18/11/2026)');
    expect(slot).toHaveAccessibleDescription('Elige una hora de entrega.');
    expect(slot).toHaveFocus();
    expect(screen.getByLabelText('Dirección de entrega')).toHaveAccessibleDescription(
      'El campo "dirección de entrega" no es correcto, revísalo.',
    );
    expect(screen.getByLabelText('Barrio de entrega')).toHaveAccessibleDescription(
      'El campo "barrio de entrega" no es correcto, revísalo.',
    );
    expect(postBody(fetchMock)).toBeUndefined();
  });

  it('si la tarifa no se puede calcular lo dice en el barrio y no deja continuar', async () => {
    mockFetch({
      quote: () =>
        Response.json({ error: 'Este objeto no ofrece entrega por rider.' }, { status: 400 }),
    });
    const user = userEvent.setup();
    renderRentalRequest();

    await openDeliveryStep(user);
    await user.click(await screen.findByRole('radio', { name: 'Entrega por rider' }));
    await user.selectOptions(
      screen.getByLabelText('Hora de entrega (18/11/2026)'),
      '09:00 – 11:00',
    );
    await user.type(screen.getByLabelText('Dirección de entrega'), 'Carrer de Sants, 140');
    const neighborhood = screen.getByLabelText('Barrio de entrega');
    await waitFor(() => expect(neighborhood).toBeEnabled());
    await user.selectOptions(neighborhood, 'Sants');
    await waitFor(() => expect(continueButton()).toBeEnabled());
    await user.click(continueButton());

    expect(neighborhood).toHaveAccessibleDescription('Este objeto no ofrece entrega por rider.');
    expect(screen.getByRole('heading', { name: 'Entrega' })).toBeInTheDocument();
  });

  it('si la API rechaza la dirección al confirmar, vuelve a la entrega con el error', async () => {
    mockFetch({
      post: () =>
        Response.json(
          {
            error: 'El campo "dirección de entrega" no es correcto, revísalo.',
            field: 'deliveryAddress',
          },
          { status: 400 },
        ),
    });
    const user = userEvent.setup();
    const { onRequested } = renderRentalRequest();

    await openDeliveryStep(user);
    await user.click(await screen.findByRole('radio', { name: 'Entrega por rider' }));
    await user.selectOptions(
      screen.getByLabelText('Hora de entrega (18/11/2026)'),
      '09:00 – 11:00',
    );
    await user.type(screen.getByLabelText('Dirección de entrega'), 'Carrer de Sants, 140');
    await waitFor(() => expect(screen.getByLabelText('Barrio de entrega')).toBeEnabled());
    await user.selectOptions(screen.getByLabelText('Barrio de entrega'), 'Sants');
    await screen.findByText('Entrega por rider: 5,00 €');
    await user.click(continueButton());
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByLabelText('Dirección de entrega')).toHaveAccessibleDescription(
      'El campo "dirección de entrega" no es correcto, revísalo.',
    );
    // Lo elegido se conserva.
    expect(screen.getByLabelText('Dirección de entrega')).toHaveValue('Carrer de Sants, 140');
    expect(onRequested).not.toHaveBeenCalled();
  });
});

describe('punto de recogida (pantalla 6)', () => {
  it('enseña los puntos con su distancia, obliga a elegir uno y lo envía', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    const { onRequested } = renderRentalRequest();

    await openDeliveryStep(user);
    await user.click(await screen.findByRole('radio', { name: 'Punto de recogida' }));

    const points = screen.getByRole('group', { name: 'Puntos cercanos' });
    expect(within(points).getAllByRole('radio')).toHaveLength(2);
    expect(within(points).getByText('1,1 km')).toBeVisible();

    await user.click(continueButton());
    expect(points).toHaveAccessibleDescription('Elige un punto de recogida.');

    await user.click(within(points).getByRole('radio', { name: /Biblioteca Jaume Fuster/ }));
    await user.click(continueButton());

    const summary = within(screen.getByText('Desde').closest('dl') as HTMLElement);
    expect(summary.getByText('Punto de recogida: Biblioteca Jaume Fuster')).toBeVisible();
    expect(summary.getByText('Plaça de Lesseps, 20-22')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(() => expect(onRequested).toHaveBeenCalled());
    expect(postBody(fetchMock)).toMatchObject({
      deliveryMode: 'pickup_point',
      pickupPointId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('si el propietario ha dejado de ofrecer el modo, vuelve a la entrega con el aviso', async () => {
    mockFetch({
      post: () =>
        Response.json(
          { error: 'Este objeto no ofrece ese modo de entrega.', field: 'deliveryMode' },
          { status: 400 },
        ),
    });
    const user = userEvent.setup();
    renderRentalRequest();

    await openDeliveryStep(user);
    await user.click(await screen.findByRole('radio', { name: 'Punto de recogida' }));
    await user.click(screen.getByRole('radio', { name: /Mercat de Sant Antoni/ }));
    await user.click(continueButton());
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este objeto no ofrece ese modo de entrega.',
    );
    expect(screen.getByRole('heading', { name: 'Entrega' })).toBeInTheDocument();
  });
});

describe('deliveryService (#282)', () => {
  it('pide las opciones, la tarifa y los barrios a la API', async () => {
    const fetchMock = mockFetch();

    await expect(getDeliveryOptions('item-1', '2026-11-18')).resolves.toEqual(ALL_MODES);
    await expect(getRiderQuote('item-1', "L'Antiga Esquerra")).resolves.toEqual({
      distanceKm: 3.2,
      fee: '5.00',
    });
    await expect(getNeighborhoods()).resolves.toEqual(NEIGHBORHOODS);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(
      /\/entrega\/tarifa\?barrio=L%27Antiga\+Esquerra$/,
    );
  });

  it('formatea la hora y la distancia', () => {
    expect(formatSlot('asap')).toBe('Lo antes posible');
    expect(formatSlot(null)).toBe('Lo antes posible');
    expect(formatSlot('19:00-21:00')).toBe('19:00 – 21:00');
    expect(formatDistance(2)).toBe('2,0 km');
  });
});
