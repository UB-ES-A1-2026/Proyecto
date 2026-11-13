// Generado con asistencia de IA (Claude)
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RiderApplication } from '../src/services/adminRiderService';
import type { SearchItem } from '../src/services/searchService';
import { renderRoute } from './renderRoute';

const ADMIN = {
  token: 'token-de-admin',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'a1', username: 'admin', email: 'admin@rentit.test', role: 'admin' },
};

function application(overrides: Partial<RiderApplication> = {}): RiderApplication {
  return {
    id: 'r1',
    status: 'pending',
    createdAt: '2026-11-10T09:00:00.000Z',
    phone: '600123123',
    zone: 'Gràcia',
    vehicle: 'bike',
    days: ['monday', 'wednesday'],
    slots: ['morning'],
    termsAcceptedAt: '2026-11-10T09:00:00.000Z',
    user: { id: 'u1', username: 'jordi', email: 'jordi@rentit.test' },
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    deliveriesCount: 0,
    ...overrides,
  };
}

function item(id: string, title: string): SearchItem {
  return {
    id,
    title,
    dailyPrice: '12.50',
    neighborhood: 'Sants',
    category: { id: 'c1', name: 'Herramientas' },
    photo: null,
  };
}

const APPLICATIONS = [
  application(),
  application({
    id: 'r2',
    status: 'approved',
    reviewedAt: '2026-11-11T10:00:00.000Z',
    deliveriesCount: 23,
    zone: 'Eixample',
    vehicle: 'motorbike',
    days: ['friday'],
    user: { id: 'u2', username: 'marta', email: 'marta@rentit.test' },
  }),
  application({
    id: 'r3',
    status: 'rejected',
    user: { id: 'u3', username: 'xavi', email: 'xavi@rentit.test' },
  }),
];

function mockApi(items: SearchItem[] = [item('i1', 'Taladro'), item('i2', 'Escalera')]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/admin/riders')) return Response.json(APPLICATIONS);
    if (url.includes('/categorias')) return Response.json([{ id: 'c1', name: 'Herramientas' }]);
    if (url.includes('/objetos')) {
      return Response.json({ items, page: 1, pageSize: 20, total: items.length });
    }
    return Response.json({ status: 'ok' });
  });
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('panel de administración (US-11.03)', () => {
  it('tiene su propio menú y no la cabecera de la web', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(ADMIN));
    mockApi();

    renderRoute('/admin');

    const menu = within(screen.getByRole('navigation', { name: 'Administración' }));
    expect(menu.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/admin',
      '/admin/objetos',
      '/admin/riders',
      '/admin/solicitudes',
    ]);
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver la web' })).toHaveAttribute('href', '/');
    // El menú avisa de las solicitudes pendientes.
    expect(await menu.findByText('1')).toBeInTheDocument();
  });

  it('el resumen cuenta objetos, riders activos y solicitudes pendientes', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(ADMIN));
    mockApi();

    renderRoute('/admin');

    const main = within(screen.getByRole('main'));
    const objects = await main.findByRole('link', { name: /Objetos publicados/ });
    await waitFor(() => expect(objects).toHaveTextContent('2'));
    expect(main.getByRole('link', { name: /Riders activos/ })).toHaveTextContent('1');
    expect(main.getByRole('link', { name: /Solicitudes pendientes/ })).toHaveTextContent('1');

    const pending = within(screen.getByRole('region', { name: 'Solicitudes por revisar' }));
    expect(pending.getByText('jordi')).toBeInTheDocument();
    expect(pending.queryByText('marta')).not.toBeInTheDocument();
    const latest = within(screen.getByRole('region', { name: 'Últimos objetos publicados' }));
    expect(latest.getByRole('link', { name: 'Taladro' })).toHaveAttribute('href', '/objetos/i1');
  });

  it('lista los objetos publicados en una tabla y busca por texto', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(ADMIN));
    const fetchMock = mockApi();
    const user = userEvent.setup();

    renderRoute('/admin/objetos');

    const table = await screen.findByRole('table', { name: 'Objetos publicados' });
    await within(table).findByText('Taladro', { selector: '.admin-cell-title' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByRole('link', { name: /Ver ficha.*Escalera/ })).toHaveAttribute(
      'href',
      '/objetos/i2',
    );

    await user.type(screen.getByLabelText('Buscar objetos'), 'taladro');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q=taladro'))).toBe(true),
    );
  });

  it('enseña solo los riders aceptados y los filtra por zona', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(ADMIN));
    mockApi();
    const user = userEvent.setup();

    renderRoute('/admin/riders');

    const table = await screen.findByRole('table', { name: 'Riders activos' });
    await within(table).findByText('marta');
    expect(within(table).queryByText('jordi')).not.toBeInTheDocument();
    expect(within(table).queryByText('xavi')).not.toBeInTheDocument();
    expect(within(table).getByText('Viernes.')).toBeInTheDocument();
    const header = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).getAllByRole('cell')[header.indexOf('Entregas')]).toHaveTextContent('23');

    await user.type(screen.getByLabelText('Buscar riders'), 'gràcia');

    expect(within(table).getByText('Ningún rider coincide con la búsqueda.')).toBeInTheDocument();
  });

  it('al aceptar una solicitud, el rider pasa a la lista de activos', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(ADMIN));
    const fetchMock = mockApi();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/admin/riders/r1/aceptar')) {
        return Response.json({ ...APPLICATIONS[0], status: 'approved' });
      }
      if (url.includes('/admin/riders')) return Response.json(APPLICATIONS);
      return Response.json({ status: 'ok' });
    });
    const user = userEvent.setup();

    renderRoute('/admin/solicitudes');

    await user.click(await screen.findByRole('button', { name: /jordi/ }));
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));
    await screen.findByRole('status');
    await user.click(screen.getByRole('link', { name: 'Riders activos' }));

    const table = await screen.findByRole('table', { name: 'Riders activos' });
    expect(within(table).getByText('jordi')).toBeInTheDocument();
    expect(within(table).getByText('marta')).toBeInTheDocument();
  });

  it('un admin que inicia sesión entra a su panel', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/auth/login')) return Response.json(ADMIN);
      return Response.json([]);
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/login');

    await user.type(screen.getByLabelText('Correo electrónico'), 'admin@rentit.test');
    await user.type(screen.getByLabelText('Contraseña'), 'Rentit2026');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
  });
  it('retira un objeto con su motivo y lo quita de la tabla', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(ADMIN));
    let withdrawn = false;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/admin/objetos/i1/retirar') && init?.method === 'POST') {
        withdrawn = true;
        return new Response(null, { status: 204 });
      }
      if (url.includes('/categorias')) return Response.json([]);
      if (url.includes('/objetos')) {
        const items = withdrawn
          ? [item('i2', 'Escalera')]
          : [item('i1', 'Taladro'), item('i2', 'Escalera')];
        return Response.json({ items, page: 1, pageSize: 20, total: items.length });
      }
      return Response.json([]);
    });
    const user = userEvent.setup();

    renderRoute('/admin/objetos');

    const list = await screen.findByRole('table', { name: 'Objetos publicados' });
    await within(list).findByText('Taladro', { selector: '.admin-cell-title' });
    await user.click(within(list).getByRole('button', { name: 'Retirar Taladro' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Retirar anuncio' }));

    // Sin motivo no deja retirarlo.
    await user.click(dialog.getByRole('button', { name: 'Retirar anuncio' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('Elige el motivo');

    await user.click(dialog.getByRole('radio', { name: /Posible estafa/ }));
    await user.type(dialog.getByLabelText(/Detalles/), 'Pide el pago por Bizum.');
    await user.click(dialog.getByRole('button', { name: 'Retirar anuncio' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '«Taladro» se ha retirado de Rentit.',
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/retirar'));
    expect(call?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-de-admin' });
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      reason: 'scam',
      details: 'Pide el pago por Bizum.',
    });
    const table = screen.getByRole('table', { name: 'Objetos publicados' });
    await waitFor(() =>
      expect(
        within(table).queryByText('Taladro', { selector: '.admin-cell-title' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('«Otro motivo» pide detalles y «Cancelar» no retira nada', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(ADMIN));
    const fetchMock = mockApi();
    const user = userEvent.setup();

    renderRoute('/admin/objetos');

    const list = await screen.findByRole('table', { name: 'Objetos publicados' });
    await within(list).findByText('Taladro', { selector: '.admin-cell-title' });
    await user.click(within(list).getByRole('button', { name: 'Retirar Taladro' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Retirar anuncio' }));
    await user.click(dialog.getByRole('radio', { name: /Otro motivo/ }));
    await user.click(dialog.getByRole('button', { name: 'Retirar anuncio' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('Explica el motivo');

    await user.click(dialog.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/retirar'))).toBe(false);
  });
});
