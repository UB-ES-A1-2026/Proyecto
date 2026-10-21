import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/useAuth';
import { logout } from '../services/authService';

// Botón «Cerrar sesión» (US-01.3): invalida la sesión en la API y borra el token del navegador.
export function LogoutButton() {
  const { session, clearSession } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!session) return null;

  async function handleLogout() {
    if (!session) return;
    setLoggingOut(true);
    try {
      await logout(session.token);
    } catch {
      // Si la API responde 401 la sesión ya no era válida; si no hay conexión, al menos
      // el token deja de estar en este navegador. En los dos casos se cierra la sesión aquí.
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  }

  return (
    <button type="button" className="button-link" onClick={handleLogout} disabled={loggingOut}>
      Cerrar sesión
    </button>
  );
}
