import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../context/useAuth';
import { LogoutButton } from './LogoutButton';

// Layout base (#21): cabecera con la navegación entre login, registro y perfil.
export function Layout() {
  const { session } = useAuth();

  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-logo">
          Rentit
        </Link>
        <nav aria-label="Principal" className="app-nav">
          {session ? (
            <>
              <NavLink to="/perfil" className="nav-link">
                Mi perfil
              </NavLink>
              <LogoutButton />
            </>
          ) : (
            <>
              <NavLink to="/login" className="nav-link">
                Iniciar sesión
              </NavLink>
              <NavLink to="/registro" className="nav-link">
                Crear cuenta
              </NavLink>
            </>
          )}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </>
  );
}
