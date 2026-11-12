// Generado con asistencia de IA (Claude)
import { Navigate } from 'react-router';
import { useAuth } from '../context/useAuth';

// Solo hay un perfil, el público (US-01.4): `/perfil` lleva al de la persona con sesión, para que los
// enlaces y favoritos antiguos sigan funcionando. Va dentro de PrivateRoute, así que siempre hay sesión.
export function MyProfileRedirect() {
  const { session } = useAuth();
  if (!session) return null;
  return <Navigate to={`/usuarios/${encodeURIComponent(session.user.id)}`} replace />;
}
