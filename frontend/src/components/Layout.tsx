import { useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';
import { Icon } from './Icon';
import { LogoutButton } from './LogoutButton';

// Layout base (#21): cabecera con la navegación entre login, registro, perfil y ayuda.
export function Layout() {
  const { session } = useAuth();
  const { pathname, search, state } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  // Al iniciar sesión se vuelve a la página en la que estaba (US-01.2, #224). Desde el registro no
  // hay a dónde volver y, si ya está en el login, se conserva la página pendiente.
  const loginState = ['/login', '/registro'].includes(pathname)
    ? state
    : { from: `${pathname}${search}` };

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-logo">
            {/* El nombre ya está al lado: para quien usa lector de pantalla, el logo es decorativo. */}
            <img src="/favicon.svg" alt="" width={28} height={28} />
            Rentit
          </Link>
          <button
            type="button"
            className="app-menu-toggle"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size="1.5rem" />
          </button>
          <nav
            aria-label="Principal"
            className="app-nav"
            data-open={menuOpen}
            onClick={() => setMenuOpen(false)}
          >
            {/* La ayuda (#89) se ve con y sin sesión. */}
            <NavLink to="/ayuda" className="nav-link">
              <Icon name="help" />
              Ayuda
            </NavLink>
            {session ? (
              <>
                <NavLink to="/objetos/nuevo" className="nav-link">
                  <Icon name="add" />
                  Publicar objeto
                </NavLink>
                <NavLink to="/mis-objetos" className="nav-link">
                  <Icon name="inventory_2" />
                  Mis objetos
                </NavLink>
                <NavLink to="/mis-solicitudes" className="nav-link">
                  <Icon name="receipt_long" />
                  Mis solicitudes
                </NavLink>
                <NavLink to="/perfil" className="nav-link">
                  <Icon name="person" />
                  Mi perfil
                </NavLink>
                <LogoutButton />
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
