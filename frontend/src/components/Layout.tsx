import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';
import { LogoutButton } from './LogoutButton';

// Layout base (#21): cabecera con la navegación entre login, registro y perfil.
export function Layout() {
  const { session } = useAuth();
  const { pathname, search, state } = useLocation();
  // Al iniciar sesión se vuelve a la página en la que estaba (US-01.2, #224). Desde el registro no
  // hay a dónde volver y, si ya está en el login, se conserva la página pendiente.
  const loginState = ['/login', '/registro'].includes(pathname)
    ? state
    : { from: `${pathname}${search}` };

  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-logo">
          {/* El nombre ya está al lado: para quien usa lector de pantalla, el logo es decorativo. */}
          <img src="/favicon.svg" alt="" width={28} height={28} />
          Rentit
        </Link>
        <nav aria-label="Principal" className="app-nav">
          {session ? (
            <>
              <NavLink to="/objetos/nuevo" className="nav-link">
                Publicar objeto
              </NavLink>
              <NavLink to="/mis-objetos" className="nav-link">
                Mis objetos
              </NavLink>
              <NavLink to="/mis-solicitudes" className="nav-link">
                Mis solicitudes
              </NavLink>
              <NavLink to="/perfil" className="nav-link">
                Mi perfil
              </NavLink>
              <LogoutButton />
            </>
          ) : (
            <>
              <NavLink to="/login" state={loginState} className="nav-link">
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
