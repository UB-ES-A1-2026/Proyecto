// Generado con asistencia de IA (Claude)
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { EditProfileDialog } from '../components/EditProfileDialog';
import { Icon } from '../components/Icon';
import { ItemCard } from '../components/ItemCard';
import { LogoutButton } from '../components/LogoutButton';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getPublicProfile, type PublicProfile } from '../services/userService';

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });
const ratingFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

const NOT_FOUND = 'No hemos encontrado este usuario.';
// La bio se guardó pero la foto no: se dice el motivo real que da la API.
const photoFailed = (reason: string) =>
  `Se ha guardado la bio, pero no la foto: ${reason} Inténtalo de nuevo.`;

type Notice = { kind: 'success' | 'error'; text: string };

function ProfileSkeleton() {
  return (
    <div className="card public-profile-header">
      <p role="status" className="manage-visually-hidden">
        Cargando el perfil…
      </p>
      <span className="skeleton public-profile-skeleton-avatar" />
      <div className="public-profile-skeleton-text">
        <span className="skeleton public-profile-skeleton-name" />
        <span className="skeleton public-profile-skeleton-line" />
        <span className="skeleton public-profile-skeleton-line" />
      </div>
    </div>
  );
}

function PublicProfileView({ id }: { id: string }) {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const userId = session?.user.id;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let ignore = false;

    getPublicProfile(id, token)
      .then((data) => {
        if (ignore) return;
        // La ruta usa optionalAuth: con un token caducado no responde 401, sino el perfil como a
        // un visitante. Si es tu propio id y no lo reconoce como tuyo, la sesión ya no vale: se
        // borra y esta petición se repite sin sesión.
        if (token && userId === data.id && !data.isOwnProfile) {
          clearSession();
          return;
        }
        setProfile(data);
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        if (requestError instanceof ApiError && requestError.status === 404) {
          setNotFound(true);
        } else if (requestError instanceof ApiError) {
          setError(requestError.message);
        } else {
          setError('Ha ocurrido un error inesperado.');
        }
      });

    return () => {
      ignore = true;
    };
  }, [id, token, userId, clearSession]);

  const handleSaved = useCallback((updated: PublicProfile, photoError: string | null) => {
    setProfile(updated);
    setEditing(false);
    setNotice(
      photoError
        ? { kind: 'error', text: photoFailed(photoError) }
        : { kind: 'success', text: 'Perfil actualizado.' },
    );
  }, []);

  if (notFound) {
    return (
      <div className="empty-state card public-profile-empty">
        <Icon name="search_off" />
        <p role="alert">{NOT_FOUND}</p>
        <Link to="/" className="button-secondary">
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="form-error">
        {error}
      </p>
    );
  }

  if (!profile) return <ProfileSkeleton />;

  const { rating } = profile;

  return (
    <>
      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`${notice.kind === 'error' ? 'form-error' : 'form-success'} manage-notice`}
        >
          <Icon name={notice.kind === 'error' ? 'error' : 'check_circle'} />
          {notice.text}
        </p>
      )}

      <div className="card public-profile-header">
        <UserAvatar username={profile.username} photo={profile.photo} />
        <div className="public-profile-info">
          {profile.isOwnProfile && (
            <p className="public-profile-own">Tu perfil · así lo ven los demás</p>
          )}
          <h1 className="public-profile-name">{profile.username}</h1>
          <p className="public-profile-since">
            Miembro desde {dateFormatter.format(new Date(profile.memberSince))}
          </p>
          {/* El correo no es público: solo lo ve su dueño, y sale de la sesión. */}
          {profile.isOwnProfile && session && (
            <p className="public-profile-email">
              <Icon name="mail" size="1.125rem" />
              <span>{session.user.email}</span>
              <span className="public-profile-email-note">solo lo ves tú</span>
            </p>
          )}
          <p className="public-profile-rating">
            <Icon name="star" size="1.125rem" />
            {rating.average === null ? (
              <span>Todavía sin valoraciones</span>
            ) : (
              <span>
                Valoración media: <strong>{ratingFormatter.format(rating.average)}</strong> de 5
                <span className="public-profile-rating-count">
                  {' '}
                  · {rating.count} {rating.count === 1 ? 'valoración' : 'valoraciones'}
                </span>
              </span>
            )}
          </p>
          {profile.bio ? (
            <p className="public-profile-bio">{profile.bio}</p>
          ) : (
            profile.isOwnProfile && (
              <p className="public-profile-bio public-profile-bio-empty">
                Añade una bio para que los demás te conozcan.
              </p>
            )
          )}
          {profile.isOwnProfile && (
            <button
              type="button"
              className="button-secondary public-profile-edit"
              onClick={() => {
                setNotice(null);
                setEditing(true);
              }}
            >
              <Icon name="edit" />
              Editar perfil
            </button>
          )}
        </div>
      </div>

      <section className="public-profile-items" aria-labelledby="public-profile-items-title">
        <div className="public-profile-section-header">
          <h2 id="public-profile-items-title" className="public-profile-section-title">
            Objetos publicados
          </h2>
          {profile.isOwnProfile && (
            <Link to="/objetos/nuevo" className="button-primary public-profile-publish">
              Publicar un objeto
            </Link>
          )}
        </div>
        {profile.items.length === 0 ? (
          <div className="empty-state card">
            <Icon name="inventory_2" />
            <p>
              {profile.isOwnProfile
                ? 'Todavía no has publicado ningún objeto.'
                : 'Todavía no tiene objetos publicados.'}
            </p>
          </div>
        ) : (
          <ul className="item-grid stagger">
            {profile.items.map((item) => (
              <ItemCard key={item.id} item={item} headingLevel="h3" />
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <EditProfileDialog
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

// El único perfil de Rentit (US-01.4, #301): el público. Se llega desde la ficha de un objeto y, la
// propia persona, desde «Mi perfil». Si es el tuyo, puedes editarlo, publicar un objeto y cerrar sesión.
export function PublicProfilePage() {
  const { id = '' } = useParams();
  const { session } = useAuth();

  return (
    <section className="public-profile">
      {/* Con key, cada usuario empieza de cero: sin restos del perfil anterior. */}
      <PublicProfileView key={id} id={id} />
      {/* Cerrar sesión no depende de que cargue el perfil: se sabe que es el tuyo por la sesión. */}
      {session?.user.id === id && (
        <div className="public-profile-logout">
          <LogoutButton />
        </div>
      )}
    </section>
  );
}
