// US-10.01 Rider acepta entregas disponibles (issue #78) · tests e2e de la tarea #294
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 23/11/2026
//
// Datos del seed: dani y oscar son riders aceptados y ana no es rider. Los dos trabajos del seed
// (la «Máquina de coser Singer» de vecino5 y la «Barbacoa de carbón portátil» de vecino6, de ana)
// solo se leen: ningún test los acepta, y los errores se simulan sin llegar a la API.
// Los tests que aceptan crean antes sus propios trabajos por la API: vecino6 solicita la Singer o
// vecino5 la Barbacoa (al revés que en el seed, que guarda una sola reserva por objeto y
// arrendatario: así repetir el seed nunca toca estas), con rider, una fecha libre de dentro de 3 o
// 4 años y una dirección de entrega única, y ana la acepta, con lo que queda pagada. Por eso estos
// e2e se pueden repetir sin volver a cargar el seed.
import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const DANI = { email: 'dani@rentit.test', password: PASSWORD };
const OSCAR = { email: 'oscar@rentit.test', password: PASSWORD };
const VECINO5 = { email: 'vecino5@rentit.test', password: PASSWORD };
const VECINO6 = { email: 'vecino6@rentit.test', password: PASSWORD };
const SINGER = 'Máquina de coser Singer';
const BARBACOA = 'Barbacoa de carbón portátil';
// Dirección de cada objeto en el seed: el rider no la ve hasta aceptar
const SINGER_ADDRESS = 'Carrer de Sants, 140, 2º 1ª';
const BARBACOA_ADDRESS = 'Travessera de les Corts, 250, 4º 2ª';
const NOT_APPROVED = 'Solo los riders aceptados pueden ver los trabajos.';
const ALREADY_TAKEN = 'Ya asignado a otro rider.';
const DAY_MS = 86_400_000;

type User = { email: string; password: string };
type Job = { id: string; title: string; startDate: string; deliveryAddress: string };
type ApiJob = { id: string; item: { title: string }; startDate: string };

// Por debajo de 1360 px la página es una sola lista de tarjetas, cada una con su «Aceptar»
test.use({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Madrid' });

// Entra con otra cuenta en la misma página: primero se borra la sesión guardada
async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

// Una página con su propia sesión, para tener a dos riders con la lista abierta a la vez
async function pageAs(browser: Browser, user: User): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    timezoneId: 'Europe/Madrid',
  });
  const page = await context.newPage();
  await login(page, user);
  return page;
}

async function apiToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  return (await response.json()).token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Hoy en España («AAAA-MM-DD»), como la API: nunca la fecha UTC del runner (#399)
function todayInSpain(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function farFutureDate(): string {
  return addDays(todayInSpain(), 3 * 365 + Math.floor(Math.random() * 365));
}

// El título del día como en la página: «Hoy», «Mañana» o «Martes, 24 de noviembre»
function dayLabel(date: string): string {
  const diff = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayInSpain()}T00:00:00Z`)) / DAY_MS,
  );
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  const text = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function uniqueId(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function itemId(request: APIRequestContext, title: string): Promise<string> {
  const response = await request.get(`${API_URL}/objetos`, { params: { q: title } });
  expect(response.status()).toBe(200);
  const { items } = await response.json();
  const item = (items as { id: string; title: string }[]).find((entry) => entry.title === title);
  expect(item, `No está «${title}»: falta el seed`).toBeTruthy();
  return (item as { id: string }).id;
}

// Una fecha de dentro de 3 o 4 años en la que todos esos objetos están libres
async function freeDate(request: APIRequestContext, titles: string[]): Promise<string> {
  const headers = auth(await apiToken(request, DANI));
  const ids = await Promise.all(titles.map((title) => itemId(request, title)));
  for (let attempt = 0; attempt < 10; attempt++) {
    const startDate = farFutureDate();
    const checks = await Promise.all(
      ids.map(async (id) => {
        const response = await request.get(`${API_URL}/reservas/disponibilidad`, {
          headers,
          params: { itemId: id, startDate, endDate: startDate },
        });
        expect(response.status()).toBe(200);
        return (await response.json()).available as boolean;
      }),
    );
    if (checks.every(Boolean)) return startDate;
  }
  throw new Error(`No hay ninguna fecha libre para ${titles.join(' y ')}`);
}

// Un trabajo nuevo: el vecino solicita el objeto de ana para ese día con entrega por rider y una
// dirección única, y ana lo acepta (queda pagado)
async function createJob(
  request: APIRequestContext,
  options: { title: string; renter: User; slot: string; neighborhood: string; startDate: string },
): Promise<Job> {
  const { title, startDate } = options;
  const deliveryAddress = `Carrer de la Prova e2e, ${uniqueId()}`;
  const created = await request.post(`${API_URL}/reservas`, {
    headers: auth(await apiToken(request, options.renter)),
    data: {
      itemId: await itemId(request, title),
      startDate,
      endDate: startDate,
      deliveryMode: 'rider',
      slot: options.slot,
      deliveryAddress,
      deliveryNeighborhood: options.neighborhood,
      confirmationTokenId: 'ctoken_simulado',
    },
  });
  expect(created.status()).toBe(201);
  const id: string = (await created.json()).id;

  const accepted = await request.post(`${API_URL}/reservas/${id}/aceptar`, {
    headers: auth(await apiToken(request, ANA)),
  });
  expect(accepted.status()).toBe(200);
  expect((await accepted.json()).status).toBe('paid');
  return { id, title, startDate, deliveryAddress };
}

async function openJobs(page: Page) {
  await page.goto('/trabajos');
  await expect(page.getByRole('heading', { level: 1, name: 'Trabajos' })).toBeVisible();
  // Lista cargada: la pestaña ya lleva el número
  await expect(availableTab(page)).toHaveText(/^Disponibles \(\d+\)$/);
}

function tabs(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Trabajos' });
}

function availableTab(page: Page): Locator {
  return tabs(page).getByRole('link', { name: /^Disponibles/ });
}

async function availableCount(page: Page): Promise<number> {
  const text = await availableTab(page).innerText();
  return Number(/\((\d+)\)/.exec(text)?.[1]);
}

// La tarjeta de un trabajo disponible, dentro de la lista de su día
function availableCard(page: Page, title: string, startDate: string): Locator {
  return page
    .getByRole('list', { name: `Trabajos de ${dayLabel(startDate)}` })
    .getByRole('listitem')
    .filter({ hasText: title });
}

// La tarjeta de un trabajo aceptado: su dirección de entrega es única
function myJobCard(page: Page, deliveryAddress: string): Locator {
  return page.getByRole('listitem').filter({ hasText: deliveryAddress });
}

function acceptedNotice(page: Page, title: string): Locator {
  return page.getByRole('status').filter({
    hasText: `Has aceptado «${title}». Lo tienes en Mis trabajos, con las direcciones.`,
  });
}

async function myJobIds(request: APIRequestContext, user: User): Promise<string[]> {
  const response = await request.get(`${API_URL}/trabajos/mios`, {
    headers: auth(await apiToken(request, user)),
  });
  expect(response.status()).toBe(200);
  return ((await response.json()).jobs as ApiJob[]).map((job) => job.id);
}

test.describe('US-10.01 Rider acepta entregas disponibles', () => {
  // Supuestos y errores: solo los riders aceptados
  test('una cuenta que no es de rider no ve «Trabajos» y la API la rechaza', async ({
    page,
    request,
  }) => {
    await login(page, ANA);
    await expect(
      page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Trabajos' }),
    ).toHaveCount(0);
    await page.goto('/trabajos');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Trabajos' })).toHaveCount(0);

    const ana = auth(await apiToken(request, ANA));
    for (const path of ['/trabajos', '/trabajos/mios']) {
      const response = await request.get(`${API_URL}${path}`, { headers: ana });
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ error: NOT_APPROVED });
    }
    const accept = await request.post(
      `${API_URL}/trabajos/00000000-0000-4000-8000-000000000000/aceptar`,
      { headers: ana },
    );
    expect(accept.status()).toBe(403);
    expect((await request.get(`${API_URL}/trabajos`)).status()).toBe(401);

    // Con un rider aceptado, la misma petición funciona
    const asRider = await request.get(`${API_URL}/trabajos`, {
      headers: auth(await apiToken(request, DANI)),
    });
    expect(asRider.status()).toBe(200);
  });

  // Criterios 1 y 2 (con los trabajos del seed, sin cambiarlos)
  test('cada trabajo muestra el objeto, los barrios de recogida y entrega, el día, la franja y la tarifa', async ({
    page,
    request,
  }) => {
    // Los dos riders aceptados ven los mismos trabajos del seed
    const listFor = async (user: User): Promise<ApiJob[]> => {
      const response = await request.get(`${API_URL}/trabajos`, {
        headers: auth(await apiToken(request, user)),
      });
      expect(response.status()).toBe(200);
      return (await response.json()).jobs;
    };
    const seedJob = (jobs: ApiJob[], title: string) => {
      const job = jobs.find((candidate) => candidate.item.title === title);
      expect(job, `No está el trabajo de «${title}»: falta el seed`).toBeTruthy();
      return job as ApiJob;
    };
    const daniJobs = await listFor(DANI);
    const oscarJobs = await listFor(OSCAR);
    const singer = seedJob(daniJobs, SINGER);
    const barbacoa = seedJob(daniJobs, BARBACOA);
    expect(oscarJobs.map((job) => job.id)).toEqual(
      expect.arrayContaining([singer.id, barbacoa.id]),
    );

    // El rider llega a «Trabajos» al entrar, con «Disponibles» elegida
    await login(page, DANI);
    await expect(page).toHaveURL(/\/trabajos$/);
    await expect(availableTab(page)).toHaveText(/^Disponibles \(\d+\)$/);
    await expect(availableTab(page)).toHaveAttribute('aria-current', 'page');

    // Agrupados por día, en orden: la Singer (mañana) antes que la Barbacoa (pasado mañana)
    const days = await page.getByRole('heading', { level: 2 }).allInnerTexts();
    expect(days.indexOf(dayLabel(singer.startDate))).toBeGreaterThanOrEqual(0);
    expect(days.indexOf(dayLabel(barbacoa.startDate))).toBeGreaterThan(
      days.indexOf(dayLabel(singer.startDate)),
    );

    const singerCard = availableCard(page, SINGER, singer.startDate);
    await expect(singerCard.getByRole('heading', { level: 3 })).toHaveText(SINGER);
    await expect(singerCard).toContainText('Recogida Sants');
    await expect(singerCard).toContainText('Entrega Gràcia');
    await expect(singerCard).toContainText('Lo antes posible');
    await expect(singerCard).toContainText(/Tarifa\s5,00\s€/);
    await expect(singerCard.getByRole('button', { name: `Aceptar ${SINGER}` })).toBeEnabled();

    const barbacoaCard = availableCard(page, BARBACOA, barbacoa.startDate);
    await expect(barbacoaCard).toContainText('Recogida Les Corts');
    await expect(barbacoaCard).toContainText('Entrega Poblenou');
    await expect(barbacoaCard).toContainText('De 17:00 a 19:00');
    await expect(barbacoaCard).toContainText(/Tarifa\s7,00\s€/);
    await expect(barbacoaCard.getByRole('button', { name: `Aceptar ${BARBACOA}` })).toBeEnabled();

    // Hasta aceptar, solo barrios: ni la dirección de recogida ni la de entrega
    await expect(singerCard).not.toContainText(SINGER_ADDRESS);
    await expect(singerCard).not.toContainText('Carrer de Verdi');
    await expect(barbacoaCard).not.toContainText(BARBACOA_ADDRESS);
    await expect(barbacoaCard).not.toContainText('Carrer de Pujades');
  });

  // Criterio 3: aceptar un trabajo
  test('al aceptar un trabajo pasa a «Mis trabajos» con las direcciones y los demás riders dejan de verlo', async ({
    browser,
    page,
    request,
  }) => {
    const job = await createJob(request, {
      title: SINGER,
      renter: VECINO6,
      slot: '11:00-13:00',
      neighborhood: 'Gràcia',
      startDate: await freeDate(request, [SINGER]),
    });
    const oscar = await pageAs(browser, OSCAR);
    await openJobs(oscar);
    await expect(availableCard(oscar, SINGER, job.startDate)).toBeVisible();

    await login(page, DANI);
    await openJobs(page);
    const before = await availableCount(page);
    const card = availableCard(page, SINGER, job.startDate);
    await expect(card).toContainText('De 11:00 a 13:00');
    await card.getByRole('button', { name: `Aceptar ${SINGER}` }).click();

    await expect(acceptedNotice(page, SINGER)).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect(availableTab(page)).toHaveText(`Disponibles (${before - 1})`);
    await expect(page).toHaveURL(/\/trabajos$/);

    // En «Mis trabajos», «Asignada» y las dos direcciones completas
    await tabs(page)
      .getByRole('link', { name: /^Mis trabajos/ })
      .click();
    await expect(page).toHaveURL(/\/trabajos\/mios$/);
    const mine = myJobCard(page, job.deliveryAddress);
    await expect(mine.getByRole('heading', { level: 3 })).toHaveText(SINGER);
    await expect(mine).toContainText('Asignada');
    await expect(mine).toContainText(`Recogida ${SINGER_ADDRESS} (Sants)`);
    await expect(mine).toContainText(`Entrega ${job.deliveryAddress} (Gràcia)`);
    await expect(mine).toContainText('De 11:00 a 13:00');
    await expect(mine).toContainText(/Tarifa\s5,00\s€/);
    await expect(mine.getByRole('link', { name: 'Ver seguimiento' })).toHaveAttribute(
      'href',
      `/entregas/${job.id}`,
    );

    // oscar lo tenía en la lista: al volver a cargarla ya no está
    await oscar.reload();
    await expect(availableTab(oscar)).toHaveText(/^Disponibles \(\d+\)$/);
    await expect(availableCard(oscar, SINGER, job.startDate)).toHaveCount(0);
    expect(await myJobIds(request, DANI)).toContain(job.id);
    await oscar.context().close();
  });

  // Criterio 3: cada trabajo por separado, varios seguidos
  test('el rider acepta varios trabajos seguidos sin salir de la lista', async ({
    page,
    request,
  }) => {
    // Los dos el mismo día: así salen juntos, en la lista de ese día
    const startDate = await freeDate(request, [SINGER, BARBACOA]);
    const first = await createJob(request, {
      title: SINGER,
      renter: VECINO6,
      slot: 'asap',
      neighborhood: 'Gràcia',
      startDate,
    });
    const second = await createJob(request, {
      title: BARBACOA,
      renter: VECINO5,
      slot: '09:00-11:00',
      neighborhood: 'Poblenou',
      startDate,
    });

    await login(page, DANI);
    await openJobs(page);
    const before = await availableCount(page);
    // El mismo día, «Lo antes posible» va primero
    const day = page.getByRole('list', { name: `Trabajos de ${dayLabel(first.startDate)}` });
    await expect(day.getByRole('heading', { level: 3 })).toHaveText([SINGER, BARBACOA]);

    await availableCard(page, SINGER, first.startDate)
      .getByRole('button', { name: `Aceptar ${SINGER}` })
      .click();
    await expect(acceptedNotice(page, SINGER)).toBeVisible();
    await expect(availableCard(page, SINGER, first.startDate)).toHaveCount(0);
    // Sigue en «Disponibles», con el otro trabajo para aceptar
    await expect(page).toHaveURL(/\/trabajos$/);
    const next = availableCard(page, BARBACOA, second.startDate);
    await expect(next.getByRole('button', { name: `Aceptar ${BARBACOA}` })).toBeEnabled();

    await next.getByRole('button', { name: `Aceptar ${BARBACOA}` }).click();
    await expect(acceptedNotice(page, BARBACOA)).toBeVisible();
    await expect(next).toHaveCount(0);
    await expect(availableTab(page)).toHaveText(`Disponibles (${before - 2})`);

    await tabs(page)
      .getByRole('link', { name: /^Mis trabajos/ })
      .click();
    await expect(myJobCard(page, first.deliveryAddress)).toContainText('Asignada');
    await expect(myJobCard(page, first.deliveryAddress)).toContainText('Lo antes posible');
    await expect(myJobCard(page, second.deliveryAddress)).toContainText('Asignada');
    await expect(myJobCard(page, second.deliveryAddress)).toContainText(
      `Recogida ${BARBACOA_ADDRESS} (Les Corts)`,
    );
    await expect(myJobCard(page, second.deliveryAddress)).toContainText(/Tarifa\s7,00\s€/);
  });

  // Criterio 4: dos riders aceptan el mismo trabajo
  test('si otro rider lo acepta antes, sale «Ya asignado a otro rider» y el trabajo desaparece', async ({
    browser,
    page,
    request,
  }) => {
    const job = await createJob(request, {
      title: BARBACOA,
      renter: VECINO5,
      slot: '15:00-17:00',
      neighborhood: 'Poblenou',
      startDate: await freeDate(request, [BARBACOA]),
    });

    // Los dos riders tienen la lista abierta con el trabajo
    await login(page, DANI);
    await openJobs(page);
    const card = availableCard(page, BARBACOA, job.startDate);
    await expect(card).toBeVisible();
    const oscar = await pageAs(browser, OSCAR);
    await openJobs(oscar);

    // oscar lo acepta primero
    await availableCard(oscar, BARBACOA, job.startDate)
      .getByRole('button', { name: `Aceptar ${BARBACOA}` })
      .click();
    await expect(acceptedNotice(oscar, BARBACOA)).toBeVisible();

    // dani, sin recargar, también pulsa «Aceptar»
    await card.getByRole('button', { name: `Aceptar ${BARBACOA}` }).click();
    await expect(page.getByRole('alert')).toHaveText(`${BARBACOA}: ${ALREADY_TAKEN}`);
    await expect(card).toHaveCount(0);
    await expect(acceptedNotice(page, BARBACOA)).toHaveCount(0);

    // Solo uno lo consigue: es de oscar, no de dani, y la API se lo niega a dani
    expect(await myJobIds(request, OSCAR)).toContain(job.id);
    expect(await myJobIds(request, DANI)).not.toContain(job.id);
    const again = await request.post(`${API_URL}/trabajos/${job.id}/aceptar`, {
      headers: auth(await apiToken(request, DANI)),
    });
    expect(again.status()).toBe(409);
    expect(await again.json()).toEqual({ error: ALREADY_TAKEN });
    await tabs(page)
      .getByRole('link', { name: /^Mis trabajos/ })
      .click();
    await expect(myJobCard(page, job.deliveryAddress)).toHaveCount(0);
    await oscar.context().close();
  });

  // Errores: si falla al aceptar, el trabajo sigue en la lista (el error se simula: el trabajo del
  // seed no cambia)
  test('si falla al aceptar, se avisa y el trabajo sigue en la lista', async ({
    page,
    request,
  }) => {
    const jobs: ApiJob[] = (
      await (
        await request.get(`${API_URL}/trabajos`, { headers: auth(await apiToken(request, DANI)) })
      ).json()
    ).jobs;
    const singer = jobs.find((job) => job.item.title === SINGER);
    expect(singer, `No está el trabajo de «${SINGER}»: falta el seed`).toBeTruthy();
    await page.route('**/api/trabajos/*/aceptar', (route) =>
      route.fulfill({
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: { error: 'Error interno' },
      }),
    );

    await login(page, DANI);
    await openJobs(page);
    const card = availableCard(page, SINGER, (singer as ApiJob).startDate);
    await card.getByRole('button', { name: `Aceptar ${SINGER}` }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'No se ha podido aceptar el trabajo. Inténtalo de nuevo.',
    );
    await expect(card.getByRole('button', { name: `Aceptar ${SINGER}` })).toBeEnabled();
  });

  // Errores: si falla la carga, «Reintentar» la vuelve a pedir
  test('si falla la carga, se avisa y «Reintentar» muestra los trabajos', async ({ page }) => {
    let failures = 1;
    await page.route('**/api/trabajos', (route) => {
      if (failures === 0) return route.continue();
      failures -= 1;
      return route.fulfill({
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: { error: 'Error interno' },
      });
    });

    await login(page, DANI);
    await expect(page.getByRole('alert')).toHaveText('No se han podido cargar los trabajos.');
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(availableTab(page)).toHaveText(/^Disponibles \(\d+\)$/);
    await expect(page.getByRole('button', { name: `Aceptar ${SINGER}` }).first()).toBeVisible();
  });

  // Sin trabajos (las dos listas se simulan vacías: en el seed siempre hay trabajos)
  test('sin trabajos disponibles ni aceptados se avisa en cada pestaña', async ({ page }) => {
    for (const path of ['**/api/trabajos', '**/api/trabajos/mios']) {
      await page.route(path, (route) =>
        route.fulfill({
          status: 200,
          headers: { 'Access-Control-Allow-Origin': '*' },
          json: { jobs: [] },
        }),
      );
    }

    await login(page, DANI);
    await expect(availableTab(page)).toHaveText('Disponibles (0)');
    await expect(page.getByText('No hay trabajos disponibles ahora mismo.')).toBeVisible();

    await tabs(page).getByRole('link', { name: 'Mis trabajos (0)' }).click();
    await expect(page).toHaveURL(/\/trabajos\/mios$/);
    await expect(page.getByText('Todavía no has aceptado ningún trabajo.')).toBeVisible();
  });
});
