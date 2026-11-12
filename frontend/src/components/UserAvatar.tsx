// Generado con asistencia de IA (Claude)
import type { CSSProperties } from 'react';

type UserAvatarProps = {
  username: string;
  photo: string | null;
  // Tamaño en rem; por defecto el del perfil público.
  size?: number;
};

// Foto de perfil, o la inicial del nombre si no tiene (US-01.4). La foto es decorativa: el nombre
// ya está escrito al lado.
export function UserAvatar({ username, photo, size = 6 }: UserAvatarProps) {
  return (
    <span className="user-avatar" style={{ '--avatar-size': `${size}rem` } as CSSProperties}>
      {photo ? (
        <img src={photo} alt="" />
      ) : (
        <span aria-hidden="true">{username.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}
