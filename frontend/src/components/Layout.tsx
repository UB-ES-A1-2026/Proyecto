import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';
import { Icon } from './Icon';

// Layout base (#21): cabecera con la navegación entre login, registro, perfil y ayuda.
export function Layout() {
  const { session } = useAuth();
  const { pathname, search, state } = useLocation();
  // Al iniciar sesión se vuelve a la página en la que estaba (US-01.2, #224). Desde el registro no
  // hay a dónde volver y, si ya está en el login, se conserva la página pendiente.
  const loginState = ['/login', '/registro'].includes(pathname)
    ? state
    : { from: `${pathname}${search}` };

  // El panel de administración tiene su propia estructura, sin la cabecera ni el pie de la web.
  if (pathname.startsWith('/admin')) {
    return (
      <>
        <Outlet />
        <ScrollRestoration />
      </>
    );
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-logo">
            {/* El nombre ya está al lado: para quien usa lector de pantalla, el logo es decorativo. */}
            <img src="/favicon.svg" alt="" width={28} height={28} />
            Rentit
          </Link>
          {/* En escritorio, enlaces de texto. En el móvil, barra inferior con iconos, como una app. */}
          <nav aria-label="Principal" className="app-nav">
            <NavLink to="/" end className="nav-link nav-home">
              <Icon name="home" />
              Inicio
            </NavLink>
            {session ? (
              <>
                <NavLink to="/mis-objetos" className="nav-link">
                  <Icon name="inventory_2" />
                  Mis objetos
                </NavLink>
                <NavLink to="/mis-solicitudes" className="nav-link">
                  <Icon name="receipt_long" />
                  Mis solicitudes
                </NavLink>
                {/* Solo el admin tiene panel de administración (US-11.03). */}
                {session.user.role === 'admin' && (
                  <NavLink to="/admin" className="nav-link">
                    <Icon name="dashboard" />
                    Panel
                  </NavLink>
                )}
                <NavLink to="/perfil" className="nav-link">
                  <Icon name="person" />
                  Mi perfil
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/login" state={loginState} className="nav-link">
                  <Icon name="login" />
                  Iniciar sesión
                </NavLink>
                <NavLink to="/registro" className="nav-link">
                  <Icon name="person_add" />
                  Crear cuenta
                </NavLink>
              </>
            )}
          </nav>
          {/* La ayuda (#89) se ve con y sin sesión. */}
          <NavLink to="/ayuda" className="nav-link nav-help" aria-label="Ayuda" title="Ayuda">
            <Icon name="help" size="1.5rem" />
          </NavLink>
        </div>
      </header>
      <main className="app-main">
        {/* Cambiar de página reinicia la animación de entrada. */}
        <div key={pathname} className="page-enter">
          <Outlet />
        </div>
      </main>
      <footer className="app-footer">
        Rentit · Proyecto de Enginyeria del Software, UB · 2026
      </footer>
      <ScrollRestoration />
    </>
  );
}
