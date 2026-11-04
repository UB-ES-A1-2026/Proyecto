// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 19/10/2026
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LogoutButton } from '../components/LogoutButton';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getMyItems } from '../services/itemService';
import { getMyReservations } from '../services/reservationService';
import { getProfile, type UserProfile } from '../services/userService';

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });

type Count = number | 'loading' | 'failed';

function ProfileSkeleton() {
  return (
    <div className="profile-identity">
      <p role="status" className="profile-loading-text">
        Cargando tu perfil…
      </p>
      <span className="skeleton profile-avatar" />
      <span className="skeleton profile-skeleton-name" />
      <span className="skeleton profile-skeleton-line" />
      <span className="skeleton profile-skeleton-line" />
    </div>
  );
}

// Enlace con su cifra. Si no se ha podido pedir, se muestra una descripción en su lugar.
function ProfileStat({
  to,
  title,
  count,
  fallback,
  featured = false,
}: {
  to: string;
  title: string;
  count: Count;
  fallback: string;
  featured?: boolean;
}) {
  return (
    <Link to={to} className="profile-stat" data-featured={featured}>
      {count === 'loading' ? (
        <span className="skeleton profile-skeleton-count" />
      ) : typeof count === 'number' ? (
        <span className="profile-stat-value">{count}</span>
      ) : (
        <span className="profile-stat-fallback">{fallback}</span>
      )}
      <span className="profile-stat-title">{title}</span>
    </Link>
  );
}

// Solo se muestra dentro de PrivateRoute, así que siempre hay sesión.
export function ProfilePage() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemCount, setItemCount] = useState<Count>('loading');
  const [requestCount, setRequestCount] = useState<Count>('loading');

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

  // Las cifras son un extra: si fallan no se avisa, y del 401 ya se encarga la petición del perfil.
  useEffect(() => {
    if (!token) return;
    let ignore = false;

    getMyItems(token)
      .then((items) => {
        if (!ignore) setItemCount(items.length);
      })
      .catch(() => {
        if (!ignore) setItemCount('failed');
      });

    getMyReservations(token)
      .then(({ sent, received }) => {
        if (!ignore) setRequestCount(sent.length + received.length);
      })
      .catch(() => {
        if (!ignore) setRequestCount('failed');
      });

    return () => {
      ignore = true;
    };
  }, [token]);

  return (
    <section className="profile-page">
      <h1 className="page-title">Mi perfil</h1>

      <div className="profile-layout">
        {error ? (
          <p role="alert" className="form-error profile-identity">
            {error}
          </p>
        ) : profile ? (
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden="true">
              {profile.username.charAt(0).toUpperCase()}
            </span>
            <p className="profile-name">{profile.username}</p>
            <dl className="profile-data">
              <div>
                <dt>Correo electrónico</dt>
                <dd>{profile.email}</dd>
              </div>
              <div>
                <dt>Miembro desde</dt>
                <dd>{dateFormatter.format(new Date(profile.createdAt))}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <ProfileSkeleton />
        )}

        <div className="profile-activity">
          <div className="profile-stats">
            <ProfileStat
              to="/mis-objetos"
              title="Mis objetos"
              count={itemCount}
              fallback="Gestiona tus anuncios"
              featured
            />
            <ProfileStat
              to="/mis-solicitudes"
              title="Mis solicitudes"
              count={requestCount}
              fallback="Enviadas y recibidas"
            />
          </div>
          <div className="card profile-publish">
            <p>¿Tienes algo que no usas?</p>
            <Link to="/objetos/nuevo" className="button-primary">
              Publicar un objeto
            </Link>
          </div>
        </div>

        <div className="profile-logout">
          <LogoutButton />
        </div>
      </div>
    </section>
  );
}
