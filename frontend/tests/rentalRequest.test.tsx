// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RentalRequest, type RentalItem } from '../src/components/RentalRequest';
import { AuthContext } from '../src/context/authContextValue';
import { requestRental } from '../src/services/rentalService';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const ITEM: RentalItem = { id: 'item-1', title: 'Taladro percutor Bosch', pricePerDay: 5 };

// Respuesta 201 de POST /api/reservas según el contrato de #120.
const RENTAL = {
  id: 'reserva-1',
  item: { id: 'item-1', title: 'Taladro percutor Bosch' },
  startDate: '2026-11-04',
  endDate: '2026-11-06',
  totalPrice: '15.00',
  status: 'pending' as const,
  renter: { id: 'u1', username: 'ana' },
  owner: { id: 'u2', username: 'bruno' },
  createdAt: '2026-11-01T12:00:00.000Z',
};

type Handler = () => Response | Promise<Response>;

// GET /reservas/disponibilidad (#204) lo responde `onAvailability` (por defecto, libre); el resto
// de peticiones, que son el POST /reservas, las responde `handler`.
function mockFetch(
  handler: Handler = () => Response.json(RENTAL, { status: 201 }),
  onAvailability: Handler = () => Response.json({ available: true }),
) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) =>
      String(input).includes('/reservas/disponibilidad') ? onAvailability() : handler(),
    );
}

// Las llamadas a POST /reservas, sin las consultas de disponibilidad.
function postCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
}

function renderRentalRequest() {
  const onCancel = vi.fn();
  const onRequested = vi.fn();
  const clearSession = vi.fn();
  render(
    <AuthContext.Provider value={{ session: SESSION, saveSession: vi.fn(), clearSession }}>
      <RentalRequest item={ITEM} onCancel={onCancel} onRequested={onRequested} />
    </AuthContext.Provider>,
  );
  return { onCancel, onRequested, clearSession };
}

// Elige fechas válidas, pasa al resumen y pulsa «Confirmar».
async function confirmRequest(user: ReturnType<typeof userEvent.setup>) {
  await chooseAvailableDates('2026-11-04', '2026-11-06');
  await user.click(requestButton());
  await user.click(screen.getByRole('button', { name: 'Confirmar' }));
}

function chooseDates(startDate: string, endDate: string) {
  fireEvent.change(screen.getByLabelText('Fecha de inicio'), { target: { value: startDate } });
  fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: endDate } });
}

// Elige las fechas y espera a que la API diga que están libres.
async function chooseAvailableDates(startDate: string, endDate: string) {
  chooseDates(startDate, endDate);
  await waitFor(() => expect(requestButton()).toBeEnabled());
}

function requestButton() {
  return screen.getByRole('button', { name: 'Solicitar alquiler' });
}

beforeEach(() => {
  // Solo se finge la fecha: «hoy» es el 1 de noviembre de 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 1, 12, 0));
  mockFetch();
});

afterEach(() => vi.useRealTimers());

describe('solicitar un alquiler (US-04.01, #121)', () => {
  it('sin fechas pide elegirlas y no deja solicitar', () => {
    renderRentalRequest();

    expect(screen.getByRole('heading', { name: 'Solicitar alquiler' })).toBeInTheDocument();
    expect(screen.getByText('Elige las fechas para ver el precio.')).toBeInTheDocument();
    expect(requestButton()).toBeDisabled();
    expect(screen.getByLabelText('Fecha de inicio')).toHaveAttribute('min', '2026-11-01');
  });

  it('muestra el precio del periodo y activa «Solicitar alquiler» si las fechas están libres', async () => {
    renderRentalRequest();

    chooseDates('2026-11-04', '2026-11-06');

    expect(screen.getByText(/3 días × 5,00 € =/)).toBeInTheDocument();
    expect(screen.getByText('15,00 €')).toBeInTheDocument();
    await waitFor(() => expect(requestButton()).toBeEnabled());
  });

  it('no deja que la fecha de fin sea anterior a la de inicio', () => {
    renderRentalRequest();

    chooseDates('2026-11-06', '2026-11-04');

    expect(screen.getByLabelText('Fecha de fin')).toHaveAccessibleDescription(
      'La fecha de fin no puede ser anterior a la fecha de inicio.',
    );
    expect(screen.getByText('Elige las fechas para ver el precio.')).toBeInTheDocument();
    expect(requestButton()).toBeDisabled();
  });

  it('no deja empezar antes de hoy', () => {
    renderRentalRequest();

    chooseDates('2026-10-30', '2026-11-02');

    expect(screen.getByLabelText('Fecha de inicio')).toHaveAccessibleDescription(
      'La fecha de inicio no puede ser anterior a hoy.',
    );
    expect(requestButton()).toBeDisabled();
  });

  it('enseña el resumen antes de enviar y «Volver» conserva las fechas', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderRentalRequest();

    await chooseAvailableDates('2026-11-04', '2026-11-06');
    await user.click(requestButton());

    expect(screen.getByRole('heading', { name: 'Revisa tu solicitud' })).toBeInTheDocument();
    const summary = screen.getByText('Desde').closest('dl');
    expect(summary).not.toBeNull();
    const details = within(summary as HTMLElement);
    expect(details.getByText('miércoles, 4 de noviembre de 2026')).toBeInTheDocument();
    expect(details.getByText('viernes, 6 de noviembre de 2026')).toBeInTheDocument();
    expect(details.getByText('Importe del alquiler (3 días)')).toBeInTheDocument();
    expect(details.getByText('15,00 €')).toBeInTheDocument();
    expect(screen.getByText('Taladro percutor Bosch')).toBeInTheDocument();
    expect(postCalls(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('2026-11-04');
    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('2026-11-06');
  });

  it('al confirmar crea la solicitud con el token y avisa a quien la usa', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    const { onRequested } = renderRentalRequest();

    await confirmRequest(user);

    expect(onRequested).toHaveBeenCalledWith(RENTAL);
    const [[url, init]] = postCalls(fetchMock);
    expect(String(url)).toMatch(/\/reservas$/);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token-de-prueba' });
    expect(JSON.parse(String(init?.body))).toEqual({
      itemId: 'item-1',
      startDate: '2026-11-04',
      endDate: '2026-11-06',
    });
  });

  it('si las fechas ya no están disponibles vuelve a elegirlas', async () => {
    mockFetch(() =>
      Response.json(
        { error: 'El objeto no está disponible en esas fechas.', field: 'startDate' },
        { status: 409 },
      ),
    );
    const user = userEvent.setup();
    const { onRequested } = renderRentalRequest();

    await confirmRequest(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El objeto no está disponible en esas fechas.',
    );
    expect(screen.getByRole('heading', { name: 'Solicitar alquiler' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('2026-11-04');
    // Ahora se sabe que no están libres: no se puede volver a solicitar con las mismas fechas.
    expect(requestButton()).toBeDisabled();
    expect(onRequested).not.toHaveBeenCalled();
  });

  it('si ya hay una solicitud igual pendiente se queda en el resumen con el aviso', async () => {
    mockFetch(() =>
      Response.json(
        { error: 'Ya tienes una solicitud pendiente para estas fechas.' },
        { status: 409 },
      ),
    );
    const user = userEvent.setup();
    const { onRequested } = renderRentalRequest();

    await confirmRequest(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya tienes una solicitud pendiente para estas fechas.',
    );
    expect(screen.getByRole('heading', { name: 'Revisa tu solicitud' })).toBeInTheDocument();
    expect(onRequested).not.toHaveBeenCalled();
  });

  it('muestra el error de la API si el objeto es tuyo', async () => {
    mockFetch(() =>
      Response.json({ error: 'No puedes alquilar tu propio objeto.' }, { status: 403 }),
    );
    const user = userEvent.setup();
    renderRentalRequest();

    await confirmRequest(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No puedes alquilar tu propio objeto.',
    );
  });

  it('si la API rechaza una fecha la marca en su campo', async () => {
    mockFetch(() =>
      Response.json(
        { error: 'La fecha de inicio no puede ser anterior a hoy.', field: 'startDate' },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    renderRentalRequest();

    await confirmRequest(user);

    expect(await screen.findByLabelText('Fecha de inicio')).toHaveAccessibleDescription(
      'La fecha de inicio no puede ser anterior a hoy.',
    );
    expect(requestButton()).toBeDisabled();
  });

  it('si falla el envío se queda en el resumen para reintentar', async () => {
    mockFetch(() => Response.json({ error: 'Ha ocurrido un error inesperado.' }, { status: 500 }));
    const user = userEvent.setup();
    renderRentalRequest();

    await confirmRequest(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Ha ocurrido un error inesperado.');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  it('con la sesión caducada la borra para volver al login', async () => {
    mockFetch(() => Response.json({ error: 'Sesión no válida' }, { status: 401 }));
    const user = userEvent.setup();
    const { clearSession, onRequested } = renderRentalRequest();

    await confirmRequest(user);

    await vi.waitFor(() => expect(clearSession).toHaveBeenCalled());
    expect(onRequested).not.toHaveBeenCalled();
  });

  it('«Cancelar» avisa a quien la usa sin enviar nada', async () => {
    const fetchMock = mockFetch(() => Response.json(RENTAL, { status: 201 }));
    const user = userEvent.setup();
    const { onCancel } = renderRentalRequest();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('requestRental (#121)', () => {
  it('hace POST /reservas con el token', async () => {
    const fetchMock = mockFetch(() => Response.json(RENTAL, { status: 201 }));

    await expect(
      requestRental('token-de-prueba', {
        itemId: 'item-1',
        startDate: '2026-11-04',
        endDate: '2026-11-06',
      }),
    ).resolves.toEqual(RENTAL);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/reservas$/);
  });
});

describe('cambios de la revisión de #203', () => {
  it('desactiva «Volver» y «Confirmar» mientras se envía', async () => {
    let respond: (response: Response) => void = () => {};
    mockFetch(() => new Promise<Response>((resolve) => (respond = resolve)));
    const user = userEvent.setup();
    const { onRequested } = renderRentalRequest();

    await confirmRequest(user);

    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Volver' })).toBeDisabled();

    respond(Response.json(RENTAL, { status: 201 }));
    await vi.waitFor(() => expect(onRequested).toHaveBeenCalledWith(RENTAL));
  });

  it('no arrastra el error de un envío anterior al volver al resumen', async () => {
    mockFetch(() =>
      Response.json(
        { error: 'El objeto no está disponible en esas fechas.', field: 'startDate' },
        { status: 409 },
      ),
    );
    const user = userEvent.setup();
    renderRentalRequest();

    await confirmRequest(user);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await chooseAvailableDates('2026-11-04', '2026-11-08');
    await user.click(requestButton());

    expect(screen.getByRole('heading', { name: 'Revisa tu solicitud' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con la sesión caducada reactiva los botones aunque siga en pantalla', async () => {
    mockFetch(() => Response.json({ error: 'Sesión no válida' }, { status: 401 }));
    const user = userEvent.setup();
    const { clearSession } = renderRentalRequest();

    await confirmRequest(user);

    await vi.waitFor(() => expect(clearSession).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Volver' })).toBeEnabled();
  });
});

describe('consulta de disponibilidad (criterio 3 de US-04.01, #204)', () => {
  it('con las dos fechas válidas pregunta a la API y espera la respuesta', async () => {
    let respond: (response: Response) => void = () => {};
    const fetchMock = mockFetch(
      undefined,
      () => new Promise<Response>((resolve) => (respond = resolve)),
    );
    renderRentalRequest();

    chooseDates('2026-11-04', '2026-11-06');

    expect(screen.getByText('Comprobando disponibilidad…')).toBeInTheDocument();
    expect(requestButton()).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(
      /\/reservas\/disponibilidad\?itemId=item-1&startDate=2026-11-04&endDate=2026-11-06$/,
    );
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token-de-prueba' });

    respond(Response.json({ available: true }));
    await waitFor(() => expect(requestButton()).toBeEnabled());
    expect(screen.queryByText('Comprobando disponibilidad…')).not.toBeInTheDocument();
  });

  it('no pregunta mientras las fechas no son válidas', () => {
    const fetchMock = mockFetch();
    renderRentalRequest();

    chooseDates('2026-11-06', '2026-11-04');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si las fechas están ocupadas lo avisa y no deja solicitar', async () => {
    mockFetch(undefined, () => Response.json({ available: false }));
    renderRentalRequest();

    chooseDates('2026-11-04', '2026-11-06');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El objeto no está disponible en esas fechas.',
    );
    expect(requestButton()).toBeDisabled();
  });

  it('ignora la respuesta de unas fechas anteriores si el usuario las cambia', async () => {
    const pending: ((response: Response) => void)[] = [];
    mockFetch(undefined, () => new Promise<Response>((resolve) => pending.push(resolve)));
    renderRentalRequest();

    chooseDates('2026-11-04', '2026-11-06');
    fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: '2026-11-08' } });
    await waitFor(() => expect(pending).toHaveLength(2));

    // Llega primero la respuesta nueva (libre) y después la antigua (ocupada).
    pending[1](Response.json({ available: true }));
    await waitFor(() => expect(requestButton()).toBeEnabled());
    pending[0](Response.json({ available: false }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestButton()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si la API rechaza una fecha al consultar, la marca en su campo', async () => {
    mockFetch(undefined, () =>
      Response.json(
        { error: 'La fecha de inicio no puede ser anterior a hoy.', field: 'startDate' },
        { status: 400 },
      ),
    );
    renderRentalRequest();

    chooseDates('2026-11-04', '2026-11-06');

    await waitFor(() =>
      expect(screen.getByLabelText('Fecha de inicio')).toHaveAccessibleDescription(
        'La fecha de inicio no puede ser anterior a hoy.',
      ),
    );
    expect(requestButton()).toBeDisabled();
  });

  it('si el objeto ya no está publicado muestra el error de la API', async () => {
    mockFetch(undefined, () =>
      Response.json({ error: 'No hemos encontrado este objeto.' }, { status: 404 }),
    );
    renderRentalRequest();

    chooseDates('2026-11-04', '2026-11-06');

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos encontrado este objeto.');
    expect(requestButton()).toBeDisabled();
  });

  it('con la sesión caducada al consultar borra la sesión', async () => {
    mockFetch(undefined, () => Response.json({ error: 'Sesión no válida' }, { status: 401 }));
    const { clearSession } = renderRentalRequest();

    chooseDates('2026-11-04', '2026-11-06');

    await waitFor(() => expect(clearSession).toHaveBeenCalled());
  });
});
