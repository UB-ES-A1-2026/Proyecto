// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 19/10/2026
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getProfile, type UserProfile } from '../services/userService';

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });

// Solo se muestra dentro de PrivateRoute, así que siempre hay sesión.
export function ProfilePage() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    getProfile(token)
      .then((data) => {
        if (!ignore) setProfile(data);
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        // Sesión caducada o revocada: al borrarla, PrivateRoute lleva al login.
        if (requestError instanceof ApiError && requestError.status === 401) {
          clearSession();
        } else if (requestError instanceof ApiError) {
          setError(requestError.message);
        } else {
          setError('Ha ocurrido un error inesperado.');
        }
      });

    return () => {
      ignore = true;
    };
  }, [token, clearSession]);

  return (
    <section className="profile-card">
      <h1>Mi perfil</h1>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : profile ? (
        <dl className="profile-data">
          <dt>Nombre de usuario</dt>
          <dd>{profile.username}</dd>
          <dt>Correo electrónico</dt>
          <dd>{profile.email}</dd>
          <dt>Miembro desde</dt>
          <dd>{dateFormatter.format(new Date(profile.createdAt))}</dd>
        </dl>
      ) : (
        <p>Cargando tu perfil…</p>
      )}
    </section>
  );
}
