// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 19/10/2026
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getMyItems } from '../services/itemService';
import { getMyReservations } from '../services/reservationService';
import { getProfile, type UserProfile } from '../services/userService';

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });

type Count = number | 'loading' | 'failed';

function ProfileSkeleton() {
  return (
    <div className="card profile-summary">
      <p role="status" className="profile-loading-text">
        Cargando tu perfil…
      </p>
      <span className="skeleton profile-avatar" />
      <div className="profile-data">
        {['user', 'email', 'date'].map((line) => (
          <div key={line}>
            <span className="skeleton profile-skeleton-label" />
            <span className="skeleton profile-skeleton-value" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileShortcut({
  to,
  icon,
  title,
  detail,
  featured = false,
}: {
  to: string;
  icon: IconName;
  title: string;
  detail: ReactNode;
  featured?: boolean;
}) {
  return (
    <Link to={to} className="card card-hover profile-shortcut">
      <span className="profile-shortcut-icon" data-featured={featured}>
        <Icon name={icon} size="1.5rem" />
      </span>
      <span className="profile-shortcut-text">
        <span className="profile-shortcut-title">{title}</span>
        <span className="profile-shortcut-detail">{detail}</span>
      </span>
      <span className="profile-shortcut-arrow">
        <Icon name="arrow_forward" />
      </span>
    </Link>
  );
}

// Si la cifra no se ha podido pedir, el acceso directo sigue con su descripción.
function countDetail(count: Count, singular: string, plural: string, fallback: string) {
  if (count === 'loading') return <span className="skeleton profile-skeleton-count" />;
  if (typeof count !== 'number') return fallback;
  return `${count} ${count === 1 ? singular : plural}`;
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
      <header className="page-header">
        <div>
          <h1 className="page-title">Mi perfil</h1>
          <p className="page-subtitle">Los datos de tu cuenta y tus accesos directos.</p>
        </div>
      </header>

      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : profile ? (
        <div className="card profile-summary">
          <span className="profile-avatar" aria-hidden="true">
            {profile.username.charAt(0).toUpperCase()}
          </span>
          <dl className="profile-data">
            <div>
              <dt>
                <Icon name="person" />
                Nombre de usuario
              </dt>
              <dd>{profile.username}</dd>
            </div>
            <div>
              <dt>
                <Icon name="mail" />
                Correo electrónico
              </dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>
                <Icon name="calendar_month" />
                Miembro desde
              </dt>
              <dd>{dateFormatter.format(new Date(profile.createdAt))}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <ProfileSkeleton />
      )}

      <h2 className="profile-section-title">Accesos directos</h2>
      <div className="profile-shortcuts stagger">
        <ProfileShortcut
          to="/mis-objetos"
          icon="inventory_2"
          title="Mis objetos"
          detail={countDetail(itemCount, 'objeto', 'objetos', 'Gestiona tus anuncios')}
        />
        <ProfileShortcut
          to="/mis-solicitudes"
          icon="receipt_long"
          title="Mis solicitudes"
          detail={countDetail(requestCount, 'solicitud', 'solicitudes', 'Enviadas y recibidas')}
        />
        <ProfileShortcut
          to="/objetos/nuevo"
          icon="add"
          title="Publicar objeto"
          detail="Pon en alquiler lo que no usas"
          featured
        />
      </div>
    </section>
  );
}
