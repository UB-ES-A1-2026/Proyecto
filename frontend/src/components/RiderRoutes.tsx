// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Guardas de rutas para las cuentas de rider (US-10.03, T35 #315).
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/useAuth';
import { isApprovedRider, isRiderSession } from '../utils/rider';

// Rutas de arrendatario (buscar, fichas, mis objetos, mis solicitudes, publicar): un rider vuelve
// al inicio, donde ve el estado de su solicitud o va a «Trabajos».
export function RenterOnlyRoute() {
  const { session } = useAuth();
  if (isRiderSession(session)) return <Navigate to="/" replace />;
  return <Outlet />;
}

// «Hazte rider» es para quien no tiene sesión: la cuenta de rider es aparte.
export function GuestOnlyRoute() {
  const { session } = useAuth();
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

// «Trabajos» solo para riders aceptados. Sin sesión, al login; con otra cuenta, al inicio.
export function ApprovedRiderRoute() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!isApprovedRider(session)) return <Navigate to="/" replace />;
  return <Outlet />;
}
