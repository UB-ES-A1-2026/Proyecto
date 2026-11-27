// Generado con asistencia de IA (Claude)
import { useState, type CSSProperties } from 'react';

type UserAvatarProps = {
  username: string;
  photo: string | null;
  // Tamaño en rem; por defecto el del perfil público.
  size?: number;
};

// Foto de perfil, o la inicial del nombre si no tiene (US-01.4). La foto es decorativa: el nombre
// ya está escrito al lado. Si la foto no carga (por ejemplo, porque su URL ha caducado), también
// sale la inicial, nunca una imagen rota (US-03.05). Generado con asistencia de IA (Claude),
// pendiente de revisión.
export function UserAvatar({ username, photo, size = 6 }: UserAvatarProps) {
  // La URL que ha fallado: si llega otra foto, se vuelve a intentar.
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const showPhoto = photo !== null && photo !== failedPhoto;

  return (
    <span className="user-avatar" style={{ '--avatar-size': `${size}rem` } as CSSProperties}>
      {showPhoto ? (
        <img src={photo} alt="" onError={() => setFailedPhoto(photo)} />
      ) : (
        <span aria-hidden="true">{username.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}
