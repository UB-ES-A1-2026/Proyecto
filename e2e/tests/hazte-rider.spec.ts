// US-10.03 Solicitar ser rider (issue #304) · tests e2e de la tarea #316
// Generado con asistencia de IA (Claude) – revisado por Danyal Anwar, 17/11/2026
import { expect, test, type Page } from '@playwright/test';

const API_BASE = 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const RIDER_APPLICATION_MESSAGE = 'Hemos recibido tu solicitud. Un admin la revisará pronto.';
const RIDER_ACCOUNT_ERROR = 'Las cuentas de rider no pueden solicitar ni publicar objetos.';

type RiderUser = {
  username: string;
  email: string;
};

function uniqueRider(): RiderUser {
  const id = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  return { username: `rider_${id}`, email: `rider_${id}@rentit.test` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function fillValidApplication(
  page: Page,
  user: RiderUser,
  overrides: { phone?: string; password?: string; email?: string } = {},
) {
  await page.getByLabel('Nombre de usuario').fill(user.username);
  await page.getByLabel('Correo electrónico').fill(overrides.email ?? user.email);
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill(overrides.password ?? PASSWORD);
  await page.getByLabel('Teléfono').fill(overrides.phone ?? '612345678');
  await page.getByLabel('Zona en la que quieres repartir').fill('Sant Andreu');
  await page.getByRole('group', { name: 'Vehículo' }).getByLabel('A pie').check();
  await page
    .getByRole('group', { name: 'Días que puedes repartir' })
    .getByRole('checkbox')
    .first()
    .check();
  await page
    .getByRole('group', { name: 'Franjas' })
    .getByRole('checkbox')
    .first()
    .check();
  await page.getByRole('checkbox', { name: 'He leído y acepto las condiciones para riders' }).check();
}

async function loginWithUi(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

async function loginWithApi(page: Page, email: string): Promise<string> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(response.status()).toBe(200);

  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.token !== 'string') {
    throw new Error('La API no devolvió un token de sesión válido.');
  }
  return body.token;
}

test.describe('US-10.03 Hazte rider', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // Criterio 1a: se entra desde Crear cuenta, no desde la cabecera (#355)
  test('sin sesión, Crear cuenta permite abrir Hazte rider', async ({ page }) => {
    const navigation = page.getByRole('navigation', { name: 'Principal' });
    await expect(navigation.getByRole('link', { name: 'Hazte rider' })).toHaveCount(0);
    await navigation.getByRole('link', { name: 'Crear cuenta' }).click();
    await page.getByRole('main').getByRole('link', { name: 'Hazte rider' }).click();

    await expect(page).toHaveURL('/hazte-rider');
    await expect(page.getByRole('heading', { name: 'Hazte rider', exact: true })).toBeVisible();
    await expect(page.getByText('Qué hace un rider:', { exact: true })).toBeVisible();
    await expect(page.getByText('Cuánto cobras:', { exact: true })).toBeVisible();
    await expect(page.getByText('Requisitos:', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar solicitud' })).toBeVisible();
  });

  // Criterio 1b
  test('con una cuenta normal no hay enlace y Hazte rider vuelve al inicio', async ({ page }) => {
    await loginWithUi(page, 'ana@rentit.test');
    const navigation = page.getByRole('navigation', { name: 'Principal' });
    await expect(navigation.getByRole('link', { name: 'Hazte rider' })).toHaveCount(0);

    await page.goto('/hazte-rider');
    await expect(page).toHaveURL('/');
  });

  // Criterio 2a
  test('el formulario presenta todos los campos, vehículos, días y franjas', async ({ page }) => {
    await page.goto('/hazte-rider');
    await expect(page.getByLabel('Nombre de usuario')).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Teléfono')).toBeVisible();
    await expect(page.getByLabel('Zona en la que quieres repartir')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'He leído y acepto las condiciones para riders' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar solicitud' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Vehículo' }).getByRole('radio')).toHaveCount(5);
    await expect(
      page.getByRole('group', { name: 'Días que puedes repartir' }).getByRole('checkbox'),
    ).toHaveCount(7);
    await expect(page.getByRole('group', { name: 'Franjas' }).getByRole('checkbox')).toHaveCount(3);
  });

  // Criterio 2b
  test('al enviar vacío, se indican todos los errores y el foco va al primer campo', async ({
    page,
  }) => {
    await page.goto('/hazte-rider');
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();

    const textFields: Array<[string, string, { exact?: boolean }?]> = [
      [
        'Nombre de usuario',
        'El campo "nombre de usuario" no está correctamente introducido, prueba a revisarlo.',
      ],
      [
        'Correo electrónico',
        'El campo "correo electrónico" no está correctamente introducido, prueba a revisarlo.',
      ],
      [
        'Contraseña',
        'El campo "contraseña" no está correctamente introducido, prueba a revisarlo.',
        { exact: true },
      ],
      ['Teléfono', 'El campo "teléfono" no es correcto, revísalo.'],
      [
        'Zona en la que quieres repartir',
        'El campo "zona" no es correcto, revísalo.',
      ],
    ];
    for (const [label, message, options] of textFields) {
      const field = options
        ? page.getByLabel(label, options)
        : page.getByLabel(label);
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText(message, { exact: true })).toBeVisible();
    }

    const groups: Array<[string, string]> = [
      ['Vehículo', 'El campo "vehículo" no es correcto, revísalo.'],
      ['Días que puedes repartir', 'El campo "días" no es correcto, revísalo.'],
      ['Franjas', 'El campo "franjas" no es correcto, revísalo.'],
    ];
    for (const [name, message] of groups) {
      await expect(page.getByRole('group', { name })).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText(message, { exact: true })).toBeVisible();
    }
    await expect(
      page.getByRole('checkbox', { name: 'He leído y acepto las condiciones para riders' }),
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Tienes que aceptar las condiciones.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Nombre de usuario')).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Solicitud enviada' })).toHaveCount(0);
  });

  // Criterio 2c
  test('el teléfono incorrecto y la contraseña corta marcan solo sus campos', async ({ page }) => {
    await page.goto('/hazte-rider');
    await fillValidApplication(page, uniqueRider(), { phone: '12345', password: 'corta' });
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();

    await expect(page.getByLabel('Teléfono')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('El campo "teléfono" no es correcto, revísalo.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(
      page.getByText(
        'El campo "contraseña" no está correctamente introducido, prueba a revisarlo.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByLabel('Nombre de usuario')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Correo electrónico')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Zona en la que quieres repartir')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  // Criterio 2d
  test('un correo ya registrado muestra el error en el campo de correo', async ({ page }) => {
    await page.goto('/hazte-rider');
    await fillValidApplication(page, uniqueRider(), { email: 'ana@rentit.test' });
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();

    await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Ya existe una cuenta con este correo.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL('/hazte-rider');
    await expect(page.getByRole('heading', { name: 'Solicitud enviada' })).toHaveCount(0);
  });

  // Criterio 3
  test('una solicitud válida se confirma, permite iniciar sesión y crea un rider pendiente', async ({
    page,
  }) => {
    const user = uniqueRider();
    await page.goto('/hazte-rider');
    await fillValidApplication(page, user);
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();

    await expect(page.getByRole('heading', { name: 'Solicitud enviada' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(RIDER_APPLICATION_MESSAGE);
    const loginLink = page.getByRole('main').getByRole('link', { name: 'Iniciar sesión' });
    await loginLink.click();
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(user.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Tu solicitud para ser rider' })).toBeVisible();
    await expect(page.getByText('Pendiente de revisión', { exact: true })).toBeVisible();

    const response = await page.request.post(`${API_BASE}/auth/login`, {
      data: { email: user.email, password: PASSWORD },
    });
    expect(response.status()).toBe(200);
    const loginBody: unknown = await response.json();
    expect(loginBody).toMatchObject({
      user: { email: user.email, isRider: true, riderStatus: 'pending' },
    });
  });

  // Criterio 4a
  test('el rider pendiente ve el estado de revisión y no puede abrir Trabajos', async ({ page }) => {
    await loginWithUi(page, 'carla@rentit.test');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Tu solicitud para ser rider' })).toBeVisible();
    await expect(page.getByText('Pendiente de revisión', { exact: true })).toBeVisible();
    const navigation = page.getByRole('navigation', { name: 'Principal' });
    await expect(navigation.getByRole('link', { name: 'Trabajos' })).toHaveCount(0);

    await page.goto('/trabajos');
    await expect(page).toHaveURL('/');
  });

  // Criterio 4b
  test('el rider aceptado abre Trabajos desde la cabecera y ve la página', async ({ page }) => {
    await loginWithUi(page, 'dani@rentit.test');
    await expect(page).toHaveURL('/trabajos');
    const navigation = page.getByRole('navigation', { name: 'Principal' });
    await expect(navigation.getByRole('link', { name: 'Trabajos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Trabajos', exact: true })).toBeVisible();
  });

  // Criterio 5a
  test('el rider aceptado no ve ni abre las páginas de alquiler y publicación', async ({ page }) => {
    await loginWithUi(page, 'dani@rentit.test');
    const navigation = page.getByRole('navigation', { name: 'Principal' });
    await expect(navigation.getByRole('link', { name: 'Mis objetos' })).toHaveCount(0);
    await expect(navigation.getByRole('link', { name: 'Mis solicitudes' })).toHaveCount(0);

    for (const path of ['/buscar?q=taladro', '/objetos/nuevo', '/mis-objetos']) {
      await page.goto(path);
      await expect(page).toHaveURL('/trabajos');
    }
  });

  // Criterio 5b
  test('la API bloquea solicitudes y publicaciones de riders con peticiones válidas', async ({
    page,
  }) => {
    const categoriesResponse = await page.request.get(`${API_BASE}/categorias`);
    expect(categoriesResponse.status()).toBe(200);
    const categories: unknown = await categoriesResponse.json();
    if (!Array.isArray(categories) || !isRecord(categories[0]) || typeof categories[0].id !== 'string') {
      throw new Error('La API no devolvió una categoría válida.');
    }

    const objectsResponse = await page.request.get(
      `${API_BASE}/objetos?q=${encodeURIComponent('cortacésped')}`,
    );
    expect(objectsResponse.status()).toBe(200);
    const objects: unknown = await objectsResponse.json();
    if (
      !isRecord(objects) ||
      !Array.isArray(objects.items) ||
      !isRecord(objects.items[0]) ||
      typeof objects.items[0].id !== 'string'
    ) {
      throw new Error('La búsqueda no devolvió el cortacésped del seed.');
    }
    const itemId = objects.items[0].id;
    const categoryId = categories[0].id;

    const start = new Date(Date.now() + (3 * 365 + Math.floor(Math.random() * 365)) * 86_400_000);
    const end = new Date(start.getTime() + 86_400_000);
    const reservationBody = {
      itemId,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      // Solicitar = pagar (US-07.01): la tarjeta de prueba que se acepta.
      confirmationTokenId: 'ctoken_simulado',
      // El Cortacésped ofrece la recogida en casa del propietario (US-05.01).
      deliveryMode: 'home',
    };
    const objectBody = {
      title: `Rider e2e ${Date.now()} ${Math.floor(Math.random() * 1_000_000)}`,
      description: 'Objeto de prueba para comprobar las restricciones de la cuenta rider.',
      dailyPrice: 100,
      categoryId,
      // US-05.01: un barrio de la lista y al menos un modo de entrega (el punto de recogida no pide
      // dirección).
      neighborhood: 'Gràcia',
      pickupPointDelivery: true,
    };

    const brunoToken = await loginWithApi(page, 'bruno@rentit.test');
    const reservationControl = await page.request.post(`${API_BASE}/reservas`, {
      headers: { Authorization: `Bearer ${brunoToken}` },
      data: reservationBody,
    });
    expect(reservationControl.status()).toBe(201);
    const objectControl = await page.request.post(`${API_BASE}/objetos`, {
      headers: { Authorization: `Bearer ${brunoToken}` },
      data: objectBody,
    });
    expect(objectControl.status()).toBe(201);

    const riderTokens = [
      await loginWithApi(page, 'carla@rentit.test'),
      await loginWithApi(page, 'dani@rentit.test'),
    ];
    for (const token of riderTokens) {
      const reservationResponse = await page.request.post(`${API_BASE}/reservas`, {
        headers: { Authorization: `Bearer ${token}` },
        data: reservationBody,
      });
      expect(reservationResponse.status()).toBe(403);
      expect(await reservationResponse.json()).toEqual({ error: RIDER_ACCOUNT_ERROR });

      const objectResponse = await page.request.post(`${API_BASE}/objetos`, {
        headers: { Authorization: `Bearer ${token}` },
        data: objectBody,
      });
      expect(objectResponse.status()).toBe(403);
      expect(await objectResponse.json()).toEqual({ error: RIDER_ACCOUNT_ERROR });
    }
  });
});
