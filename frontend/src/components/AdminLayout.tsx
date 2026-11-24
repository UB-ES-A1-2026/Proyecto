// Generado con asistencia de IA (Claude)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';
import { getRiderApplications, type RiderApplication } from '../services/adminRiderService';
import { ApiError } from '../services/apiClient';
import type { AdminData } from './adminData';
import { Icon, type IconName } from './Icon';
import { LogoutButton } from './LogoutButton';

const SECTIONS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/admin', label: 'Resumen', icon: 'dashboard', end: true },
  { to: '/admin/objetos', label: 'Objetos', icon: 'inventory_2' },
  { to: '/admin/riders', label: 'Riders activos', icon: 'group' },
  { to: '/admin/solicitudes', label: 'Solicitudes', icon: 'receipt_long' },
];

// Panel de administración: una zona aparte de la web, con su propio menú lateral.
export function AdminLayout() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const { pathname } = useLocation();
  const [applications, setApplications] = useState<RiderApplication[] | null>(null);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);

  const handleError = useCallback(
    (requestError: unknown) => {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
      } else if (requestError instanceof ApiError && requestError.status === 0) {
        setApplicationsError(requestError.message);
      } else {
        setApplicationsError(
          'No hemos podido cargar las solicitudes. Inténtalo de nuevo más tarde.',
        );
      }
    },
    [clearSession],
  );

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    getRiderApplications(token)
      .then((data) => {
        if (ignore) return;
        setApplications(data);
        setApplicationsError(null);
      })
      .catch((requestError: unknown) => {
        if (!ignore) handleError(requestError);
      });

    return () => {
      ignore = true;
    };
  }, [token, handleError]);

  const data = useMemo<AdminData>(
    () => ({
      applications,
      applicationsError,
      replaceApplication: (updated) =>
        setApplications(
          (current) =>
            current &&
            current.map((application) => (application.id === updated.id ? updated : application)),
        ),
      reloadApplications: () => {
        if (!token) return;
        // Si una recarga va bien, se quita el error de una carga anterior.
        getRiderApplications(token)
          .then((data) => {
            setApplications(data);
            setApplicationsError(null);
          })
          .catch(handleError);
      },
    }),
    [applications, applicationsError, token, handleError],
  );

  const pending = applications?.filter((application) => application.status === 'pending').length;
  const username = session?.user.username ?? '';

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          <span className="admin-brand-text">
            Rentit
            <small>Administración</small>
          </span>
        </Link>

        <nav aria-label="Administración" className="admin-nav">
          {SECTIONS.map((section) => (
            <NavLink key={section.to} to={section.to} end={section.end} className="admin-nav-link">
              <Icon name={section.icon} />
              <span className="admin-nav-label">{section.label}</span>
              {section.to === '/admin/solicitudes' && pending !== undefined && pending > 0 && (
                <span className="admin-nav-count">
                  {pending}
                  <span className="manage-visually-hidden"> pendientes</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <Link to="/" className="admin-exit">
            <Icon name="open_in_new" />
            Ver la web
          </Link>
          <div className="admin-user">
            <span className="admin-user-avatar" aria-hidden="true">
              {username.charAt(0).toUpperCase()}
            </span>
            <span className="admin-user-text">
              {username}
              <small>Administrador</small>
            </span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="admin-main">
        {/* Cambiar de sección reinicia la animación de entrada. */}
        <div key={pathname} className="page-enter">
          <Outlet context={data} />
        </div>
      </main>
    </div>
  );
}
