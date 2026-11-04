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
  const onRequested = vi.fn();
  const onSessionExpired = vi.fn();
  const clearSession = vi.fn();
  render(
    <AuthContext.Provider value={{ session: SESSION, saveSession: vi.fn(), clearSession }}>
      <RentalRequest item={ITEM} onRequested={onRequested} onSessionExpired={onSessionExpired} />
    </AuthContext.Provider>,
  );
  return { onRequested, onSessionExpired, clearSession };
}

// Elige fechas válidas, pasa al resumen y pulsa «Confirmar».
async function confirmRequest(user: ReturnType<typeof userEvent.setup>) {
  await chooseAvailableDates('04/11/2026', '06/11/2026');
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

function dayButton(name: string) {
  return screen.getByRole('button', { name });
}

function pressedDays() {
  return within(screen.getByRole('grid'))
    .getAllByRole('button', { pressed: true })
    .map((day) => day.getAttribute('aria-label'));
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

    expect(screen.getByRole('heading', { name: 'Elige las fechas' })).toBeInTheDocument();
    expect(screen.getByText('Elige las fechas para ver el precio.')).toBeInTheDocument();
    expect(requestButton()).toBeDisabled();
    // Hoy es el día 1: el mes actual es el primero que se puede ver.
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
    expect(dayButton('1 de noviembre de 2026')).toBeEnabled();
  });

  it('muestra el precio del periodo y activa «Solicitar alquiler» si las fechas están libres', async () => {
    renderRentalRequest();

    chooseDates('04/11/2026', '06/11/2026');

    expect(screen.getByText(/3 días × 5,00 € =/)).toBeInTheDocument();
    expect(screen.getByText('15,00 €')).toBeInTheDocument();
    await waitFor(() => expect(requestButton()).toBeEnabled());
    expect(screen.getByRole('status')).toHaveTextContent('Fechas disponibles');
  });

  it('no deja que la fecha de fin sea anterior a la de inicio', () => {
    renderRentalRequest();

    chooseDates('06/11/2026', '04/11/2026');

    expect(screen.getByLabelText('Fecha de fin')).toHaveAccessibleDescription(
      'La fecha de fin no puede ser anterior a la fecha de inicio.',
    );
    expect(screen.getByText('Elige las fechas para ver el precio.')).toBeInTheDocument();
    expect(requestButton()).toBeDisabled();
  });

  it('no deja empezar antes de hoy', () => {
    renderRentalRequest();

    chooseDates('30/10/2026', '02/11/2026');

    expect(screen.getByLabelText('Fecha de inicio')).toHaveAccessibleDescription(
      'La fecha de inicio no puede ser anterior a hoy.',
    );
    expect(requestButton()).toBeDisabled();
  });

  it('enseña el resumen antes de enviar y «Volver» conserva las fechas', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderRentalRequest();

    await chooseAvailableDates('04/11/2026', '06/11/2026');
    await user.click(requestButton());

    // El botón pulsado ya no existe: el foco pasa al título del resumen.
    expect(screen.getByRole('heading', { name: 'Revisa tu solicitud' })).toHaveFocus();
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

    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('04/11/2026');
    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('06/11/2026');
    expect(screen.getByRole('heading', { name: 'Elige las fechas' })).toHaveFocus();
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
    expect(screen.getByRole('heading', { name: 'Elige las fechas' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('04/11/2026');
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

  it('con la sesión caducada la borra y avisa para volver al login', async () => {
    mockFetch(() => Response.json({ error: 'Sesión no válida' }, { status: 401 }));
    const user = userEvent.setup();
    const { clearSession, onRequested, onSessionExpired } = renderRentalRequest();

    await confirmRequest(user);

    await vi.waitFor(() => expect(clearSession).toHaveBeenCalled());
    expect(onSessionExpired).toHaveBeenCalled();
    expect(onRequested).not.toHaveBeenCalled();
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

    await chooseAvailableDates('04/11/2026', '08/11/2026');
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

    chooseDates('04/11/2026', '06/11/2026');

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

    chooseDates('06/11/2026', '04/11/2026');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si las fechas están ocupadas lo avisa y no deja solicitar', async () => {
    mockFetch(undefined, () => Response.json({ available: false }));
    renderRentalRequest();

    chooseDates('04/11/2026', '06/11/2026');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El objeto no está disponible en esas fechas.',
    );
    expect(requestButton()).toBeDisabled();
  });

  it('ignora la respuesta de unas fechas anteriores si el usuario las cambia', async () => {
    const pending: ((response: Response) => void)[] = [];
    mockFetch(undefined, () => new Promise<Response>((resolve) => pending.push(resolve)));
    renderRentalRequest();

    chooseDates('04/11/2026', '06/11/2026');
    fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: '08/11/2026' } });
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

    chooseDates('04/11/2026', '06/11/2026');

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

    chooseDates('04/11/2026', '06/11/2026');

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos encontrado este objeto.');
    expect(requestButton()).toBeDisabled();
  });

  it('con la sesión caducada al consultar borra la sesión', async () => {
    mockFetch(undefined, () => Response.json({ error: 'Sesión no válida' }, { status: 401 }));
    const { clearSession, onSessionExpired } = renderRentalRequest();

    chooseDates('04/11/2026', '06/11/2026');

    await waitFor(() => expect(clearSession).toHaveBeenCalled());
    expect(onSessionExpired).toHaveBeenCalled();
  });
});

describe('calendario de fechas', () => {
  it('el primer clic pone el inicio y el segundo el fin, y calcula el precio', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderRentalRequest();

    await user.click(dayButton('4 de noviembre de 2026'));

    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('04/11/2026');
    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('');
    expect(dayButton('4 de noviembre de 2026')).toHaveAttribute('aria-pressed', 'true');
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(dayButton('6 de noviembre de 2026'));

    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('06/11/2026');
    expect(pressedDays()).toEqual([
      '4 de noviembre de 2026',
      '5 de noviembre de 2026',
      '6 de noviembre de 2026',
    ]);
    expect(screen.getByText(/3 días × 5,00 € =/)).toHaveTextContent('15,00 €');
    await waitFor(() => expect(requestButton()).toBeEnabled());
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/startDate=2026-11-04&endDate=2026-11-06$/);
  });

  it('un clic anterior al inicio mientras se elige el fin empieza de nuevo con esa fecha', async () => {
    const user = userEvent.setup();
    renderRentalRequest();

    await user.click(dayButton('10 de noviembre de 2026'));
    await user.click(dayButton('4 de noviembre de 2026'));

    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('04/11/2026');
    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('');
    expect(pressedDays()).toEqual(['4 de noviembre de 2026']);
  });

  it('con el rango completo, otro clic empieza un rango nuevo', async () => {
    const user = userEvent.setup();
    renderRentalRequest();

    await user.click(dayButton('4 de noviembre de 2026'));
    await user.click(dayButton('6 de noviembre de 2026'));
    await user.click(dayButton('20 de noviembre de 2026'));

    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('20/11/2026');
    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('');
    expect(pressedDays()).toEqual(['20 de noviembre de 2026']);
    expect(screen.getByText('Elige las fechas para ver el precio.')).toBeInTheDocument();
  });

  it('dos clics en el mismo día son un alquiler de un día', async () => {
    const user = userEvent.setup();
    renderRentalRequest();

    await user.click(dayButton('4 de noviembre de 2026'));
    await user.click(dayButton('4 de noviembre de 2026'));

    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('04/11/2026');
    expect(screen.getByText(/1 día × 5,00 € =/)).toHaveTextContent('5,00 €');
    await waitFor(() => expect(requestButton()).toBeEnabled());
  });

  it('los días pasados están desactivados y hoy está marcado', async () => {
    vi.setSystemTime(new Date(2026, 10, 10, 12, 0));
    const user = userEvent.setup();
    renderRentalRequest();

    expect(dayButton('9 de noviembre de 2026')).toBeDisabled();
    expect(dayButton('10 de noviembre de 2026')).toBeEnabled();
    expect(dayButton('10 de noviembre de 2026')).toHaveAttribute('aria-current', 'date');

    await user.click(dayButton('9 de noviembre de 2026'));
    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('');
  });

  it('cambia de mes con las flechas, anuncia el mes y conserva el rango entre meses', async () => {
    const user = userEvent.setup();
    renderRentalRequest();
    const previous = screen.getByRole('button', { name: 'Mes anterior' });
    const next = screen.getByRole('button', { name: 'Mes siguiente' });
    expect(screen.getByText('noviembre de 2026')).toHaveAttribute('aria-live', 'polite');

    await user.click(dayButton('28 de noviembre de 2026'));
    await user.click(next);

    expect(screen.getByText('diciembre de 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '28 de noviembre de 2026' })).toBeNull();
    expect(previous).toBeEnabled();

    await user.click(dayButton('2 de diciembre de 2026'));

    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('28/11/2026');
    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('02/12/2026');
    expect(pressedDays()).toEqual(['1 de diciembre de 2026', '2 de diciembre de 2026']);

    previous.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByText('noviembre de 2026')).toBeInTheDocument();
    expect(previous).toBeDisabled();
    // El botón pulsado se ha desactivado: el foco no se pierde.
    expect(next).toHaveFocus();
  });

  it('la semana empieza en lunes, con las iniciales en español', () => {
    renderRentalRequest();

    const headers = within(screen.getByRole('grid')).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'L',
      'M',
      'X',
      'J',
      'V',
      'S',
      'D',
    ]);
    expect(headers[0]).toHaveAccessibleName('lunes');
    // El 1 de noviembre de 2026 es domingo: último hueco de la primera semana.
    const firstWeek = within(screen.getByRole('grid')).getAllByRole('row')[1];
    expect(firstWeek.lastElementChild).toHaveTextContent('1');
    expect(firstWeek.firstElementChild).toBeEmptyDOMElement();
  });

  it('una fecha escrita se enseña en el calendario', () => {
    renderRentalRequest();

    fireEvent.change(screen.getByLabelText('Fecha de inicio'), {
      target: { value: '10/03/2030' },
    });

    expect(screen.getByText('marzo de 2030')).toBeInTheDocument();
    expect(dayButton('10 de marzo de 2030')).toHaveAttribute('aria-pressed', 'true');
  });

  it('solo valida la fecha cuando está completa', () => {
    renderRentalRequest();
    const start = screen.getByLabelText('Fecha de inicio');

    fireEvent.change(start, { target: { value: '31/02' } });
    expect(start).not.toHaveAttribute('aria-invalid');

    fireEvent.change(start, { target: { value: '31/02/2030' } });
    expect(start).toHaveAttribute('aria-invalid', 'true');
    expect(start).toHaveAccessibleDescription('Esa fecha no existe.');
    expect(requestButton()).toBeDisabled();
  });

  it('pone las barras al escribir y completa la fecha al salir del campo', async () => {
    const user = userEvent.setup();
    renderRentalRequest();
    const start = screen.getByLabelText('Fecha de inicio');

    await user.type(start, '10032030');
    expect(start).toHaveValue('10/03/2030');

    await user.clear(start);
    await user.type(start, '1/3/2030');
    expect(start).toHaveValue('1/3/2030');
    await user.tab();
    expect(start).toHaveValue('01/03/2030');
  });

  it('con una fecha de inicio pasada escrita, el clic empieza de nuevo', async () => {
    const user = userEvent.setup();
    renderRentalRequest();

    fireEvent.change(screen.getByLabelText('Fecha de inicio'), {
      target: { value: '30/10/2026' },
    });
    await user.click(dayButton('4 de noviembre de 2026'));

    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('04/11/2026');
    expect(screen.getByLabelText('Fecha de inicio')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('');
  });

  it('se navega con las flechas, cruzando de mes, y nunca hasta un día pasado', async () => {
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0));
    const user = userEvent.setup();
    renderRentalRequest();
    const today = dayButton('25 de noviembre de 2026');

    // Un solo día entra en el orden de tabulación.
    expect(today).toHaveAttribute('tabindex', '0');
    expect(dayButton('26 de noviembre de 2026')).toHaveAttribute('tabindex', '-1');

    today.focus();
    await user.keyboard('{ArrowLeft}');
    expect(today).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(dayButton('26 de noviembre de 2026')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByText('diciembre de 2026')).toBeInTheDocument();
    expect(dayButton('3 de diciembre de 2026')).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('03/12/2026');

    await user.keyboard('{PageUp}');
    expect(screen.getByText('noviembre de 2026')).toBeInTheDocument();
    expect(dayButton('25 de noviembre de 2026')).toHaveFocus();
  });
});
