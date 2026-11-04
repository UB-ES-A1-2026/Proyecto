// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 03/11/2026
import { test, expect, type Page } from '@playwright/test';

/**
 * US-04.02 Consultar mis solicitudes (issue #61) · tests e2e de la tarea #176
 * Un test por criterio de aceptación (casos CP-MSO-01..06 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado. Solicitudes del seed
 * (DEMO_RESERVATIONS en backend/prisma/demoData.ts) que usan estos tests, y que no tocan los e2e
 * de aceptar y rechazar:
 * - bruno → «Escalera de aluminio de 3 peldaños» de ana: aceptada.
 * - ana → «Proyector Full HD» de bruno: pendiente.
 * - ana → «Altavoz Bluetooth JBL» de bruno: rechazada.
 */
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

async function openMyReservations(page: Page) {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mis solicitudes' })
    .click();
  await expect(page).toHaveURL('/mis-solicitudes');
  await expect(page.getByRole('heading', { level: 1, name: 'Mis solicitudes' })).toBeVisible();
}

function section(page: Page, name: 'Enviadas' | 'Recibidas') {
  return page.getByRole('region', { name });
}

// El botón de cada solicitud dice «<objeto> · <fechas> · <estado>»
function reservation(page: Page, name: 'Enviadas' | 'Recibidas', title: string) {
  return section(page, name).getByRole('button', { name: new RegExp(title) });
}

test.describe('US-04.02 Consultar mis solicitudes', () => {
  // Criterio 1
  test('la lista muestra el objeto, las fechas y el estado de cada solicitud', async ({ page }) => {
    await login(page, BRUNO);
    await openMyReservations(page);

    const escalera = reservation(page, 'Enviadas', 'Escalera de aluminio de 3 peldaños');
    await expect(escalera).toBeVisible();
    // Fechas cortas, p. ej. «17–18 nov. 2026»
    await expect(escalera).toHaveText(/\d{1,2}.*\d{4}/);
    await expect(escalera).toHaveText(/Aceptada$/);
  });

  // Criterio 2
  test('se ven los estados «Pendiente», «Aceptada» y «Rechazada»', async ({ page }) => {
    await login(page, ANA);
    await openMyReservations(page);

    await expect(reservation(page, 'Enviadas', 'Proyector Full HD')).toHaveText(/Pendiente$/);
    await expect(reservation(page, 'Enviadas', 'Altavoz Bluetooth JBL')).toHaveText(/Rechazada$/);
    await expect(reservation(page, 'Recibidas', 'Escalera de aluminio de 3 peldaños')).toHaveText(
      /Aceptada$/,
    );
  });

  // Criterio 3
  test('al pulsar una solicitud se ven sus detalles', async ({ page }) => {
    await login(page, ANA);
    await openMyReservations(page);

    const proyector = reservation(page, 'Enviadas', 'Proyector Full HD');
    await expect(proyector).toHaveAttribute('aria-expanded', 'false');
    await proyector.click();

    await expect(proyector).toHaveAttribute('aria-expanded', 'true');
    const detail = section(page, 'Enviadas').locator('.reservation-card-detail').filter({
      hasText: 'Proyector Full HD',
    });
    await expect(detail.getByRole('link', { name: 'Proyector Full HD' })).toHaveAttribute(
      'href',
      /^\/objetos\/[0-9a-f-]{36}$/,
    );
    await expect(detail.getByText(/^Fecha: \d{1,2} de \w+ de \d{4}$/)).toBeVisible();
    // 12 €/día × 1 día
    await expect(detail.getByText(/^Importe total: 12,00\s€$/)).toBeVisible();
    await expect(detail.getByText('Estado: Pendiente')).toBeVisible();
    await expect(detail.getByText('Propietario: bruno')).toBeVisible();
  });

  // Criterio 4
  test('sin solicitudes se muestra «No tienes solicitudes abiertas»', async ({ page }) => {
    const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await page.goto('/registro');
    await page.getByLabel('Nombre de usuario').fill(`usuario_${id}`);
    await page.getByLabel('Correo electrónico').fill(`usuario${id}@rentit.test`);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();

    await openMyReservations(page);

    await expect(
      section(page, 'Enviadas').getByText('No tienes solicitudes abiertas'),
    ).toBeVisible();
    await expect(
      section(page, 'Recibidas').getByText('Todavía no has recibido solicitudes.'),
    ).toBeVisible();
  });

  // Recibidas: el propietario ve las solicitudes que le llegan, con quién las ha hecho
  test('el propietario ve entre las recibidas las solicitudes a sus objetos', async ({ page }) => {
    await login(page, ANA);
    await openMyReservations(page);

    const escalera = reservation(page, 'Recibidas', 'Escalera de aluminio de 3 peldaños');
    await escalera.click();

    const card = section(page, 'Recibidas')
      .locator('.reservation-card')
      .filter({ hasText: 'Escalera de aluminio de 3 peldaños' });
    await expect(card.getByText('Solicitada por: bruno')).toBeVisible();
    await expect(reservation(page, 'Enviadas', 'Escalera de aluminio de 3 peldaños')).toHaveCount(
      0,
    );
  });

  // Acceso
  test('sin sesión, «Mis solicitudes» lleva al login', async ({ page }) => {
    await page.goto('/mis-solicitudes');

    await expect(page).toHaveURL('/login');
  });
});
