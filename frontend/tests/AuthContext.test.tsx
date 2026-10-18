import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../src/context/AuthContext';
import { useAuth } from '../src/context/useAuth';

const SESSION_KEY = 'rentit.session';

const session = (expiresAt: string) => ({
  token: 'token-guardado',
  expiresAt,
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
});

function ShowSession() {
  const { session, clearSession } = useAuth();
  return (
    <>
      <p>{session ? `Sesión de ${session.user.username}` : 'Sin sesión'}</p>
      <button onClick={clearSession}>Borrar</button>
    </>
  );
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <ShowSession />
    </AuthProvider>,
  );
}

afterEach(() => localStorage.clear());

describe('AuthContext', () => {
  it('recupera la sesión guardada al recargar la página', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session('2099-01-01T00:00:00.000Z')));

    renderWithAuth();

    expect(screen.getByText('Sesión de ana')).toBeInTheDocument();
  });

  it('descarta y borra una sesión caducada', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session('2000-01-01T00:00:00.000Z')));

    renderWithAuth();

    expect(screen.getByText('Sin sesión')).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('ignora datos guardados que no son una sesión válida', () => {
    localStorage.setItem(SESSION_KEY, '{esto no es json');

    renderWithAuth();

    expect(screen.getByText('Sin sesión')).toBeInTheDocument();
  });

  it('clearSession borra la sesión del estado y de localStorage', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session('2099-01-01T00:00:00.000Z')));
    renderWithAuth();

    act(() => screen.getByRole('button', { name: 'Borrar' }).click());

    expect(screen.getByText('Sin sesión')).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
