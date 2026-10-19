import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';

// Rutas que necesitan sesión (#29): sin sesión lleva al login, que después devuelve aquí.
export function PrivateRoute() {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
