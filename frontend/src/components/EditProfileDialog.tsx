// Generado con asistencia de IA (Claude)
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { ACCEPTED_PHOTO_TYPES, uploadProfilePhoto } from '../services/photoService';
import { deleteProfilePhoto, updateBio, type PublicProfile } from '../services/userService';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { UserAvatar } from './UserAvatar';

// La bio admite hasta 500 caracteres (usuario.bio, #300).
const BIO_MAX = 500;
const BIO_ERROR = 'El campo "bio" no es correcto, revísalo.';
const PHOTO_TYPE_ERROR = 'Solo se pueden subir fotos JPG, PNG o WebP.';

type EditProfileDialogProps = {
  profile: PublicProfile;
  onClose: () => void;
  // photoError: la bio se guardó pero la foto no, con el motivo; null si todo fue bien.
  onSaved: (profile: PublicProfile, photoError: string | null) => void;
};

type NewPhoto = { file: File; previewUrl?: string };

// Editar la foto y la bio del propio perfil (US-01.4, #301). Los cambios se envían al pulsar
// «Guardar»; «Cancelar», Esc o el fondo cierran sin cambiar nada.
export function EditProfileDialog({ profile, onClose, onSaved }: EditProfileDialogProps) {
  const { session, clearSession } = useAuth();
  const bioId = useId();
  const photoInput = useRef<HTMLInputElement>(null);
  const bioInput = useRef<HTMLTextAreaElement>(null);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [newPhoto, setNewPhoto] = useState<NewPhoto | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // La vista previa se libera al cambiar de foto y al cerrar la ventana.
  useEffect(() => {
    const url = newPhoto?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [newPhoto]);

  function handlePhotoSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!ACCEPTED_PHOTO_TYPES.split(',').includes(file.type)) {
      setPhotoError(PHOTO_TYPE_ERROR);
      return;
    }
    setPhotoError(null);
    setRemovePhoto(false);
    const previewUrl =
      typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined;
    setNewPhoto({ file, previewUrl });
  }

  function handleRemovePhoto() {
    setPhotoError(null);
    if (newPhoto) setNewPhoto(null);
    else setRemovePhoto(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !session) return;

    const trimmedBio = bio.trim();
    if (trimmedBio.length > BIO_MAX) {
      setBioError(BIO_ERROR);
      bioInput.current?.focus();
      return;
    }

    const bioChanged = trimmedBio !== (profile.bio ?? '');
    const photoChanged = newPhoto !== null || removePhoto;
    if (!bioChanged && !photoChanged) {
      onClose();
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setBioError(null);
    setPhotoError(null);

    let latest = profile;
    try {
      if (bioChanged) latest = await updateBio(session.token, trimmedBio);
    } catch (error) {
      handleFailure(error);
      return;
    }

    // Lo de la bio ya está guardado: si falla la foto se avisa, pero no se pierde.
    try {
      if (newPhoto) {
        latest = await uploadProfilePhoto(newPhoto.file, session.token);
      } else if (removePhoto) {
        await deleteProfilePhoto(session.token);
        latest = { ...latest, photo: null };
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return;
      }
      const reason = error instanceof ApiError ? error.message : 'No se ha podido guardar la foto.';
      if (bioChanged) {
        onSaved(latest, reason);
      } else {
        setPhotoError(reason);
        setSubmitting(false);
      }
      return;
    }

    onSaved(latest, null);
  }

  function handleFailure(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      clearSession();
      return;
    }
    if (error instanceof ApiError && error.field === 'bio') {
      setBioError(BIO_ERROR);
      bioInput.current?.focus();
    } else if (error instanceof ApiError) {
      setFormError(error.message);
    } else {
      setFormError('Ha ocurrido un error inesperado.');
    }
    setSubmitting(false);
  }

  const shownPhoto = removePhoto ? null : (newPhoto?.previewUrl ?? profile.photo);
  const canRemove = newPhoto !== null || (profile.photo !== null && !removePhoto);
  const describedBy = [`${bioId}-hint`, bioError ? `${bioId}-error` : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <Modal title="Editar perfil" onClose={onClose}>
      {formError && (
        <p role="alert" className="form-error manage-notice">
          <Icon name="error" />
          {formError}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <span className="edit-profile-label">Foto</span>
          <div className="edit-profile-photo">
            <UserAvatar username={profile.username} photo={shownPhoto} size={5} />
            <div className="edit-profile-photo-actions">
              <input
                ref={photoInput}
                type="file"
                accept={ACCEPTED_PHOTO_TYPES}
                className="manage-visually-hidden"
                aria-label="Elegir una foto de perfil"
                tabIndex={-1}
                onChange={(event) => {
                  handlePhotoSelected(event.target.files);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                className="button-secondary"
                aria-describedby={`${bioId}-photo-hint`}
                onClick={() => photoInput.current?.click()}
              >
                <Icon name="photo_camera" />
                {shownPhoto ? 'Cambiar foto' : 'Subir una foto'}
              </button>
              {canRemove && (
                <button type="button" className="button-quiet" onClick={handleRemovePhoto}>
                  Quitar foto
                </button>
              )}
            </div>
          </div>
          <p id={`${bioId}-photo-hint`} className="field-hint">
            JPG, PNG o WebP, hasta 5 MB. Se cambia al pulsar «Guardar».
          </p>
          {photoError && (
            <p role="alert" className="field-error">
              {photoError}
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor={bioId}>Bio</label>
          <textarea
            id={bioId}
            ref={bioInput}
            name="bio"
            rows={5}
            maxLength={BIO_MAX}
            value={bio}
            onChange={(event) => {
              setBio(event.target.value);
              setBioError(null);
            }}
            aria-invalid={bioError ? true : undefined}
            aria-describedby={describedBy}
          />
          <p id={`${bioId}-hint`} className="field-hint">
            Opcional. Máximo {BIO_MAX} caracteres ({bio.length}/{BIO_MAX}).
          </p>
          {bioError && (
            <p id={`${bioId}-error`} className="field-error">
              {bioError}
            </p>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
