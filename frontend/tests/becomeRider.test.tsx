// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// «Hazte rider» (US-10.03, T35 #315). Wireframe: docs/wireframes/US-10.03-hazte-rider.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const RECEIVED = 'Hemos recibido tu solicitud. Un admin la revisará pronto.';

function mainNav() {
  return within(screen.getByRole('navigation', { name: 'Principal' }));
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nombre de usuario'), 'pau.rider');
  await user.type(screen.getByLabelText('Correo electrónico'), 'pau@ejemplo.com');
  await user.type(screen.getByLabelText('Contraseña'), 'Rentit2026');
  await user.type(screen.getByLabelText('Teléfono'), '+34 612 345 678');
  await user.type(screen.getByLabelText('Zona en la que quieres repartir'), 'Gràcia');
  await user.click(screen.getByRole('radio', { name: 'Bici' }));
  await user.click(screen.getByRole('checkbox', { name: 'Lunes' }));
  await user.click(screen.getByRole('checkbox', { name: 'Viernes' }));
  await user.click(screen.getByRole('checkbox', { name: 'Tarde (14 – 20 h)' }));
  await user.click(
    screen.getByRole('checkbox', { name: 'He leído y acepto las condiciones para riders' }),
  );
}

afterEach(() => localStorage.clear());

describe('«Hazte rider» en la cabecera (US-10.03)', () => {
  it('sin sesión aparece y lleva a /hazte-rider', () => {
    renderRoute('/');

    expect(mainNav().getByRole('link', { name: 'Hazte rider' })).toHaveAttribute(
      'href',
      '/hazte-rider',
    );
  });

  it('con una sesión normal no aparece, y /hazte-rider vuelve al inicio', () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));

    const { router } = renderRoute('/hazte-rider');

    expect(router.state.location.pathname).toBe('/');
    expect(mainNav().queryByRole('link', { name: 'Hazte rider' })).not.toBeInTheDocument();
  });
});

describe('cuestionario de rider (US-10.03, #315)', () => {
  it('explica qué hace un rider, cuánto cobra y despliega las condiciones', async () => {
    const user = userEvent.setup();
    renderRoute('/hazte-rider');

    expect(screen.getByRole('heading', { level: 1, name: 'Hazte rider' })).toBeInTheDocument();
    expect(screen.getByText(/de 3 a 7 € según la distancia/)).toBeInTheDocument();
    const terms = screen.getByText('Condiciones para riders');
    expect(screen.getByText(/Puedes darte de baja cuando quieras/)).not.toBeVisible();
    await user.click(terms);
    expect(screen.getByText(/Puedes darte de baja cuando quieras/)).toBeVisible();
  });

  it('si se envía vacío marca todos los campos y pone el foco en el primero', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    renderRoute('/hazte-rider');

    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    expect(
      screen.getByText(
        'El campo "nombre de usuario" no está correctamente introducido, prueba a revisarlo.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('El campo "teléfono" no es correcto, revísalo.')).toBeInTheDocument();
    expect(screen.getByText('El campo "zona" no es correcto, revísalo.')).toBeInTheDocument();
    expect(screen.getByText('El campo "vehículo" no es correcto, revísalo.')).toBeInTheDocument();
    expect(screen.getByText('El campo "días" no es correcto, revísalo.')).toBeInTheDocument();
    expect(screen.getByText('El campo "franjas" no es correcto, revísalo.')).toBeInTheDocument();
    expect(screen.getByText('Tienes que aceptar las condiciones.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de usuario')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('el error de un campo desaparece al editarlo', async () => {
    const user = userEvent.setup();
    renderRoute('/hazte-rider');

    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await user.click(screen.getByRole('checkbox', { name: 'Lunes' }));

    expect(screen.queryByText('El campo "días" no es correcto, revísalo.')).not.toBeInTheDocument();
  });

  it('envía los valores en inglés y enseña la confirmación sin iniciar sesión', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ message: RECEIVED, status: 'pending' }, { status: 201 }));
    const user = userEvent.setup();
    renderRoute('/hazte-rider');

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    expect(await screen.findByRole('heading', { name: 'Solicitud enviada' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(RECEIVED);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/riders$/);
    expect(JSON.parse(String(init?.body))).toEqual({
      username: 'pau.rider',
      email: 'pau@ejemplo.com',
      password: 'Rentit2026',
      phone: '+34 612 345 678',
      zone: 'Gràcia',
      vehicle: 'bike',
      days: ['monday', 'friday'],
      slots: ['afternoon'],
      acceptedTerms: true,
    });
    expect(localStorage.getItem('rentit.session')).toBeNull();
  });

  it('«Iniciar sesión» lleva al login con el correo ya puesto', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ message: RECEIVED, status: 'pending' }, { status: 201 }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/hazte-rider');

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await screen.findByRole('heading', { name: 'Solicitud enviada' });
    await user.click(
      within(screen.getByRole('main')).getByRole('link', { name: 'Iniciar sesión' }),
    );

    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('pau@ejemplo.com');
  });

  it('enseña en su campo el error de la API, con su texto exacto (409)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        { error: 'Ya existe una cuenta con este correo.', field: 'email' },
        { status: 409 },
      ),
    );
    const user = userEvent.setup();
    renderRoute('/hazte-rider');

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    expect(await screen.findByText('Ya existe una cuenta con este correo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');
  });

  it('si no hay conexión lo dice encima del formulario y no pierde lo escrito', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderRoute('/hazte-rider');

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede conectar con el servidor. Inténtalo más tarde.',
    );
    expect(screen.getByLabelText('Nombre de usuario')).toHaveValue('pau.rider');
  });
});
