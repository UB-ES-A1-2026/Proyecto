import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';

// Rutas del admin (US-11.03): sin sesión, al login; con una cuenta que no es de admin, al inicio.
// La API también las rechaza: esto solo evita enseñar una pantalla que no se puede usar.
export function AdminRoute() {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (session.user.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}
