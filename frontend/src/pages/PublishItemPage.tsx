import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getCategories, type Category } from '../services/categoryService';
import { ACCEPTED_PHOTO_TYPES, uploadItemPhoto } from '../services/photoService';
import { createItem, type NewItem } from '../services/publishItemService';

type Field =
  | 'title'
  | 'description'
  | 'categoryId'
  | 'dailyPrice'
  | 'deposit'
  | 'neighborhood'
  | 'photos';
type FieldErrors = Partial<Record<Field, string>>;
type SelectedPhoto = { id: number; file: File; previewUrl?: string };

const FIELD_ORDER: Field[] = [
  'title',
  'description',
  'categoryId',
  'dailyPrice',
  'deposit',
  'neighborhood',
  'photos',
];

const FIELD_NAMES: Record<Field, string> = {
  title: 'nombre',
  description: 'descripción',
  categoryId: 'categoría',
  dailyPrice: 'precio',
  deposit: 'fianza',
  neighborhood: 'barrio',
  photos: 'fotografías',
};

const API_FIELDS: Record<string, Field> = {
  title: 'title',
  description: 'description',
  categoryId: 'categoryId',
  dailyPrice: 'dailyPrice',
  deposit: 'deposit',
  neighborhood: 'neighborhood',
  photos: 'photos',
};

const PRICE_PATTERN = /^\d{1,8}([.,]\d{1,2})?$/;
const ACCEPTED_TYPES = ACCEPTED_PHOTO_TYPES.split(',');
const GENERIC_ERROR = 'No hemos podido publicar el objeto. Inténtalo de nuevo más tarde.';
const PHOTO_UPLOAD_ERROR = 'El anuncio se ha publicado, pero alguna foto no se ha podido subir.';

function fieldError(field: Field): string {
  return `El campo "${FIELD_NAMES[field]}" no es correcto, revísalo.`;
}

function validate(values: {
  title: string;
  description: string;
  categoryId: string;
  dailyPrice: string;
  deposit: string;
  neighborhood: string;
  photos: SelectedPhoto[];
}): FieldErrors {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  const description = values.description.trim();
  const neighborhood = values.neighborhood.trim();
  const dailyPrice = values.dailyPrice.trim();
  const deposit = values.deposit.trim();

  if (!title || title.length > 100) errors.title = fieldError('title');
  if (!description || values.description.length > 2000) {
    errors.description = fieldError('description');
  }
  if (!values.categoryId) errors.categoryId = fieldError('categoryId');
  if (
    !PRICE_PATTERN.test(dailyPrice) ||
    Number(dailyPrice.replace(',', '.')) <= 0
  ) {
    errors.dailyPrice = fieldError('dailyPrice');
  }
  if (
    deposit !== '' &&
    (!PRICE_PATTERN.test(deposit) || Number(deposit.replace(',', '.')) < 0)
  ) {
    errors.deposit = fieldError('deposit');
  }
  if (!neighborhood || neighborhood.length > 100) {
    errors.neighborhood = fieldError('neighborhood');
  }
  if (
    values.photos.length > 5 ||
    values.photos.some((photo) => !ACCEPTED_TYPES.includes(photo.file.type))
  ) {
    errors.photos = fieldError('photos');
  }
  return errors;
}

function isField(field: string | undefined): field is Field {
  return field !== undefined && Object.hasOwn(API_FIELDS, field);
}

function amountToNumber(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

// Generado con asistencia de IA – revisado por Danyal, 03/11/2026
export function PublishItemPage() {
  const { session, clearSession } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dailyPrice, setDailyPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [status, setStatus] = useState<NewItem['status']>('published');
  const [homeDelivery, setHomeDelivery] = useState(false);
  const [riderDelivery, setRiderDelivery] = useState(false);
  const [pickupPointDelivery, setPickupPointDelivery] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [partialSuccessId, setPartialSuccessId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const dailyPriceRef = useRef<HTMLInputElement>(null);
  const depositRef = useRef<HTMLInputElement>(null);
  const neighborhoodRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const nextPhotoId = useRef(0);
  const activePreviewUrls = useRef(new Set<string>());

  useEffect(() => {
    let ignore = false;
    getCategories()
      .then((result) => {
        if (!ignore) setCategories(result);
      })
      .catch(() => {
        if (!ignore) setFormError('No se han podido cargar las categorías.');
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(
    () => () => {
      for (const url of activePreviewUrls.current) URL.revokeObjectURL(url);
      activePreviewUrls.current.clear();
    },
    [],
  );

  function clearError(field: Field) {
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
    setPartialSuccessId(null);
  }

  function showFieldErrors(fieldErrors: FieldErrors): boolean {
    setErrors(fieldErrors);
    const firstInvalid = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!firstInvalid) return false;

    const refs = {
      title: titleRef,
      description: descriptionRef,
      categoryId: categoryRef,
      dailyPrice: dailyPriceRef,
      deposit: depositRef,
      neighborhood: neighborhoodRef,
      photos: photosRef,
    };
    refs[firstInvalid].current?.focus();
    return true;
  }

  function describedBy(field: Field, hint?: string): string | undefined {
    const ids = [hint, errors[field] ? `publish-item-${field}-error` : undefined].filter(
      (id): id is string => Boolean(id),
    );
    return ids.length > 0 ? ids.join(' ') : undefined;
  }

  function releasePreview(url: string | undefined) {
    if (!url) return;
    URL.revokeObjectURL(url);
    activePreviewUrls.current.delete(url);
  }

  function handlePhotoSelection(files: FileList | null) {
    if (!files) return;
    const addedPhotos = Array.from(files).map((file) => {
      const id = nextPhotoId.current++;
      const previewUrl = ACCEPTED_TYPES.includes(file.type) ? URL.createObjectURL(file) : undefined;
      if (previewUrl) activePreviewUrls.current.add(previewUrl);
      return { id, file, previewUrl };
    });
    setPhotos((current) => [...current, ...addedPhotos]);
    clearError('photos');
  }

  function removePhoto(photo: SelectedPhoto) {
    releasePreview(photo.previewUrl);
    setPhotos((current) => current.filter(({ id }) => id !== photo.id));
    clearError('photos');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    setFormError(null);
    setPartialSuccessId(null);
    if (
      showFieldErrors(
        validate({ title, description, categoryId, dailyPrice, deposit, neighborhood, photos }),
      )
    ) {
      return;
    }

    const token = session?.token;
    if (!token) return;

    const data: NewItem = {
      title: title.trim(),
      description: description.trim(),
      categoryId,
      dailyPrice: amountToNumber(dailyPrice),
      deposit: deposit.trim() === '' ? 0 : amountToNumber(deposit),
      neighborhood: neighborhood.trim(),
      homeDelivery,
      riderDelivery,
      pickupPointDelivery,
      status,
    };

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const item = await createItem(token, data);
      for (const photo of photos) {
        try {
          await uploadItemPhoto(item.id, photo.file, token);
        } catch (uploadError) {
          if (uploadError instanceof ApiError && uploadError.status === 401) {
            clearSession();
            return;
          }
          setPartialSuccessId(item.id);
          return;
        }
      }
      navigate(`/objetos/${item.id}`);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
      } else if (requestError instanceof ApiError && requestError.status === 400) {
        if (isField(requestError.field)) {
          showFieldErrors({ [API_FIELDS[requestError.field]]: fieldError(API_FIELDS[requestError.field]) });
        } else {
          setFormError(GENERIC_ERROR);
        }
      } else if (requestError instanceof ApiError && requestError.status === 0) {
        setFormError(requestError.message);
      } else {
        setFormError(GENERIC_ERROR);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="publish-item">
      <h1>Publicar un objeto</h1>
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
      {partialSuccessId && (
        <p role="alert" className="publish-item-partial-success">
          {PHOTO_UPLOAD_ERROR}{' '}
          <Link to={`/objetos/${partialSuccessId}`}>Ver el anuncio</Link>
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className="publish-item-field">
          <label htmlFor="publish-item-title">Nombre</label>
          <input
            id="publish-item-title"
            ref={titleRef}
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              clearError('title');
            }}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describedBy('title')}
          />
          {errors.title && (
            <p id="publish-item-title-error" className="field-error">
              {errors.title}
            </p>
          )}
        </div>

        <div className="publish-item-field">
          <label htmlFor="publish-item-description">Descripción</label>
          <textarea
            id="publish-item-description"
            ref={descriptionRef}
            rows={3}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              clearError('description');
            }}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={describedBy('description')}
          />
          {errors.description && (
            <p id="publish-item-description-error" className="field-error">
              {errors.description}
            </p>
          )}
        </div>

        <div className="publish-item-field">
          <label htmlFor="publish-item-category">Categoría</label>
          <select
            id="publish-item-category"
            ref={categoryRef}
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              clearError('categoryId');
            }}
            aria-invalid={errors.categoryId ? true : undefined}
            aria-describedby={describedBy('categoryId')}
          >
            <option value="">Elige una categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId && (
            <p id="publish-item-categoryId-error" className="field-error">
              {errors.categoryId}
            </p>
          )}
        </div>

        <div className="publish-item-field">
          <label htmlFor="publish-item-daily-price">Precio por día (€)</label>
          <input
            id="publish-item-daily-price"
            ref={dailyPriceRef}
            type="text"
            inputMode="decimal"
            value={dailyPrice}
            onChange={(event) => {
              setDailyPrice(event.target.value);
              clearError('dailyPrice');
            }}
            aria-invalid={errors.dailyPrice ? true : undefined}
            aria-describedby={describedBy('dailyPrice')}
          />
          {errors.dailyPrice && (
            <p id="publish-item-dailyPrice-error" className="field-error">
              {errors.dailyPrice}
            </p>
          )}
        </div>

        <div className="publish-item-field">
          <label htmlFor="publish-item-deposit">Fianza (€)</label>
          <input
            id="publish-item-deposit"
            ref={depositRef}
            type="text"
            inputMode="decimal"
            value={deposit}
            onChange={(event) => {
              setDeposit(event.target.value);
              clearError('deposit');
            }}
            aria-invalid={errors.deposit ? true : undefined}
            aria-describedby={describedBy('deposit', 'publish-item-deposit-hint')}
          />
          <p id="publish-item-deposit-hint" className="field-hint">
            Déjalo vacío si no pides fianza
          </p>
          {errors.deposit && (
            <p id="publish-item-deposit-error" className="field-error">
              {errors.deposit}
            </p>
          )}
        </div>

        <div className="publish-item-field">
          <label htmlFor="publish-item-neighborhood">Barrio</label>
          <input
            id="publish-item-neighborhood"
            ref={neighborhoodRef}
            type="text"
            value={neighborhood}
            onChange={(event) => {
              setNeighborhood(event.target.value);
              clearError('neighborhood');
            }}
            aria-invalid={errors.neighborhood ? true : undefined}
            aria-describedby={describedBy('neighborhood')}
          />
          {errors.neighborhood && (
            <p id="publish-item-neighborhood-error" className="field-error">
              {errors.neighborhood}
            </p>
          )}
        </div>

        <div className="publish-item-field">
          <label htmlFor="publish-item-photos">Fotografías</label>
          <input
            id="publish-item-photos"
            ref={photosRef}
            type="file"
            multiple
            accept={ACCEPTED_PHOTO_TYPES}
            onChange={(event) => {
              handlePhotoSelection(event.target.files);
              event.target.value = '';
            }}
            aria-invalid={errors.photos ? true : undefined}
            aria-describedby={describedBy('photos', 'publish-item-photos-hint')}
          />
          <p id="publish-item-photos-hint" className="field-hint">
            Hasta 5 fotos JPG, PNG o WebP, de 5 MB como máximo
          </p>
          {errors.photos && (
            <p id="publish-item-photos-error" className="field-error">
              {errors.photos}
            </p>
          )}
          {photos.length > 0 && (
            <div className="publish-item-photos">
              {photos.map((photo, index) => (
                <div className="publish-item-photo" key={photo.id}>
                  {photo.previewUrl && (
                    <img src={photo.previewUrl} alt={`Vista previa de fotografía ${index + 1}`} />
                  )}
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => removePhoto(photo)}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <fieldset className="publish-item-field">
          <legend className="publish-item-legend">Disponibilidad</legend>
          <div className="publish-item-options">
            <label>
              <input
                type="radio"
                name="status"
                value="published"
                checked={status === 'published'}
                onChange={() => setStatus('published')}
              />
              Disponible ya
            </label>
            <label>
              <input
                type="radio"
                name="status"
                value="paused"
                checked={status === 'paused'}
                onChange={() => setStatus('paused')}
              />
              Pausado (no aparece en las búsquedas)
            </label>
          </div>
        </fieldset>

        <fieldset className="publish-item-field">
          <legend className="publish-item-legend">Formas de entrega</legend>
          <div className="publish-item-options">
            <label>
              <input
                type="checkbox"
                checked={homeDelivery}
                onChange={(event) => setHomeDelivery(event.target.checked)}
              />
              Entrega a domicilio
            </label>
            <label>
              <input
                type="checkbox"
                checked={riderDelivery}
                onChange={(event) => setRiderDelivery(event.target.checked)}
              />
              Entrega con rider
            </label>
            <label>
              <input
                type="checkbox"
                checked={pickupPointDelivery}
                onChange={(event) => setPickupPointDelivery(event.target.checked)}
              />
              Punto de recogida
            </label>
          </div>
        </fieldset>

        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? 'Publicando…' : 'Publicar'}
        </button>
      </form>
    </section>
  );
}
