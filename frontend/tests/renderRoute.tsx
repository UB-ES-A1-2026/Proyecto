import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router';
import { routes } from '../src/routes/routes';

// Renderiza la app en una URL concreta, con las mismas rutas que en producción.
// Devuelve también el router para poder comprobar a qué URL ha navegado la app.
export function renderRoute(entry: InitialEntry) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  return { router, ...render(<RouterProvider router={router} />) };
}
