import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getCategories, type Category } from '../services/categoryService';
import { ACCEPTED_PHOTO_TYPES, uploadItemPhoto } from '../services/photoService';
import { getNeighborhoods } from '../services/neighborhoodService';
import { createItem, type NewItem } from '../services/publishItemService';
import {
  ADDRESS_HINT,
  ADDRESS_MAX,
  DELIVERY_HINT,
  DELIVERY_MODE_LABELS,
  NO_DELIVERY_MODE_ERROR,
  PICKUP_ONLY_HINT,
  needsAddress,
  validateDelivery,
  type DeliveryModes,
} from '../utils/delivery';

type Field =
  | 'title'
  | 'description'
  | 'categoryId'
  | 'dailyPrice'
  | 'deposit'
  | 'neighborhood'
  | 'photos'
  | 'deliveryModes'
  | 'address';
type FieldErrors = Partial<Record<Field, string>>;
type SelectedPhoto = { id: number; file: File; previewUrl?: string };

// En el orden de la pantalla: el foco va al primer campo con error.
const FIELD_ORDER: Field[] = [
  'title',
  'description',
  'categoryId',
  'neighborhood',
  'dailyPrice',
  'deposit',
  'photos',
  'deliveryModes',
  'address',
];

const FIELD_NAMES: Record<Field, string> = {
  title: 'nombre',
  description: 'descripción',
  categoryId: 'categoría',
  dailyPrice: 'precio',
  deposit: 'fianza',
  neighborhood: 'barrio',
  photos: 'fotografías',
  deliveryModes: 'modo de entrega',
  address: 'dirección',
};

const API_FIELDS: Record<string, Field> = {
  title: 'title',
  description: 'description',
  categoryId: 'categoryId',
  dailyPrice: 'dailyPrice',
  deposit: 'deposit',
  neighborhood: 'neighborhood',
  photos: 'photos',
  deliveryModes: 'deliveryModes',
  address: 'address',
};

const PRICE_PATTERN = /^\d{1,8}([.,]\d{1,2})?$/;
const ACCEPTED_TYPES = ACCEPTED_PHOTO_TYPES.split(',');
const MAX_PHOTOS = 5;
const GENERIC_ERROR = 'No hemos podido publicar el objeto. Inténtalo de nuevo más tarde.';
const PHOTO_UPLOAD_ERROR = 'El anuncio se ha publicado, pero alguna foto no se ha podido subir.';

function fieldError(field: Field): string {
  // Mismo texto que el backend para «sin ningún modo» (US-05.01, #307).
  if (field === 'deliveryModes') return NO_DELIVERY_MODE_ERROR;
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
  modes: DeliveryModes;
  address: string;
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
  if (!PRICE_PATTERN.test(dailyPrice) || Number(dailyPrice.replace(',', '.')) <= 0) {
    errors.dailyPrice = fieldError('dailyPrice');
  }
  if (deposit !== '' && (!PRICE_PATTERN.test(deposit) || Number(deposit.replace(',', '.')) < 0)) {
    errors.deposit = fieldError('deposit');
  }
  if (!neighborhood || neighborhood.length > 100) {
    errors.neighborhood = fieldError('neighborhood');
  }
  if (
    values.photos.length > MAX_PHOTOS ||
    values.photos.some((photo) => !ACCEPTED_TYPES.includes(photo.file.type))
  ) {
    errors.photos = fieldError('photos');
  }
  return { ...errors, ...validateDelivery(values.modes, values.address) };
}

function isField(field: string | undefined): field is Field {
  return field !== undefined && Object.hasOwn(API_FIELDS, field);
}

function amountToNumber(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="publish-section-title">{children}</h2>;
}

// Tarjeta seleccionable: sigue siendo un input con su label, para el teclado y los lectores.
function OptionCard({
  icon,
  label,
  ...inputProps
}: { icon: IconName; label: string } & ComponentProps<'input'>) {
  return (
    <label className="publish-option">
      <span className="publish-option-icon">
        <Icon name={icon} />
      </span>
      <span className="publish-option-text">{label}</span>
      <input {...inputProps} />
    </label>
  );
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
  const [draggingPhotos, setDraggingPhotos] = useState(false);
  const [status, setStatus] = useState<NewItem['status']>('published');
  const [homeDelivery, setHomeDelivery] = useState(false);
  const [riderDelivery, setRiderDelivery] = useState(false);
  const [pickupPointDelivery, setPickupPointDelivery] = useState(false);
  const [address, setAddress] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [partialSuccessId, setPartialSuccessId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const dailyPriceRef = useRef<HTMLInputElement>(null);
  const depositRef = useRef<HTMLInputElement>(null);
  const neighborhoodRef = useRef<HTMLSelectElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const deliveryRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const modes: DeliveryModes = { homeDelivery, riderDelivery, pickupPointDelivery };
  const showAddress = needsAddress(modes);
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
    // El barrio se elige de la lista de la API (US-05.01, #307).
    getNeighborhoods()
      .then((result) => {
        if (!ignore) setNeighborhoods(result);
      })
      .catch(() => {
        if (!ignore) setFormError('No se han podido cargar los barrios.');
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

  if (partialSuccessId) {
    return (
      <section className="publish-item">
        <p role="alert" className="publish-item-partial-success">
          <Icon name="warning" size="1.5rem" />
          <span>
            {PHOTO_UPLOAD_ERROR} <Link to={`/objetos/${partialSuccessId}`}>Ver el anuncio</Link>
          </span>
        </p>
      </section>
    );
  }

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
      deliveryModes: deliveryRef,
      address: addressRef,
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
        validate({
          title,
          description,
          categoryId,
          dailyPrice,
          deposit,
          neighborhood,
          photos,
          modes,
          address,
        }),
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
      ...(showAddress ? { address: address.trim() } : {}),
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
          showFieldErrors({
            [API_FIELDS[requestError.field]]: fieldError(API_FIELDS[requestError.field]),
          });
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
      <header className="page-header">
        <div>
          <h1 className="page-title">Publicar un objeto</h1>
          <p className="page-subtitle">
            Cuéntale a tu barrio qué ofreces y empieza a recibir solicitudes.
          </p>
        </div>
      </header>
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
      <form className="publish-form" onSubmit={handleSubmit} noValidate>
        <div className="publish-column stagger">
          <section className="card publish-section">
            <SectionTitle>Datos del objeto</SectionTitle>

            <div className="form-field">
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

            <div className="form-field">
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

            <div className="publish-field-row">
              <div className="form-field">
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

              <div className="form-field">
                <label htmlFor="publish-item-neighborhood">Barrio</label>
                <select
                  id="publish-item-neighborhood"
                  ref={neighborhoodRef}
                  value={neighborhood}
                  onChange={(event) => {
                    setNeighborhood(event.target.value);
                    clearError('neighborhood');
                  }}
                  aria-invalid={errors.neighborhood ? true : undefined}
                  aria-describedby={describedBy('neighborhood')}
                >
                  <option value="">Elige un barrio</option>
                  {neighborhoods.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {errors.neighborhood && (
                  <p id="publish-item-neighborhood-error" className="field-error">
                    {errors.neighborhood}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="card publish-section">
            <SectionTitle>Precio</SectionTitle>

            <div className="publish-field-row">
              <div className="form-field">
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

              <div className="form-field">
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
            </div>
          </section>

          <section className="card publish-section">
            <SectionTitle>Fotos</SectionTitle>

            {/* El input ocupa toda la zona: abre el selector al pulsar y recibe el foco. */}
            <div
              className="publish-dropzone"
              data-dragging={draggingPhotos}
              data-invalid={Boolean(errors.photos)}
              onDragOver={(event) => {
                event.preventDefault();
                setDraggingPhotos(true);
              }}
              onDragLeave={() => setDraggingPhotos(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDraggingPhotos(false);
                handlePhotoSelection(event.dataTransfer.files);
              }}
            >
              <span className="publish-dropzone-icon">
                <Icon name="add_photo_alternate" size="2rem" />
              </span>
              <label htmlFor="publish-item-photos">Fotografías</label>
              <span className="publish-dropzone-text">
                Arrastra tus fotos aquí o pulsa para elegirlas
              </span>
              <input
                id="publish-item-photos"
                ref={photosRef}
                type="file"
                multiple
                title=""
                accept={ACCEPTED_PHOTO_TYPES}
                onChange={(event) => {
                  handlePhotoSelection(event.target.files);
                  event.target.value = '';
                }}
                aria-invalid={errors.photos ? true : undefined}
                aria-describedby={describedBy('photos', 'publish-item-photos-hint')}
              />
            </div>
            <p id="publish-item-photos-hint" className="field-hint">
              Hasta 5 fotos JPG, PNG o WebP, de 5 MB como máximo
            </p>
            {errors.photos && (
              <p id="publish-item-photos-error" className="field-error">
                {errors.photos}
              </p>
            )}
            {photos.length > 0 && (
              <>
                <p
                  className={photos.length > MAX_PHOTOS ? 'field-error' : 'field-hint'}
                  aria-live="polite"
                >
                  {photos.length} de {MAX_PHOTOS} fotos
                </p>
                <div className="publish-item-photos">
                  {photos.map((photo, index) => (
                    <div className="publish-item-photo" key={photo.id}>
                      {photo.previewUrl ? (
                        <img
                          src={photo.previewUrl}
                          alt={`Vista previa de fotografía ${index + 1}`}
                        />
                      ) : (
                        <span className="publish-item-photo-file">
                          <Icon name="image" size="1.75rem" />
                          <span>{photo.file.name}</span>
                        </span>
                      )}
                      <button
                        type="button"
                        className="publish-item-photo-remove"
                        onClick={() => removePhoto(photo)}
                      >
                        <Icon name="close" size="1rem" />
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="publish-column stagger">
          <div className="card publish-section">
            <fieldset className="publish-fieldset">
              <legend>
                <SectionTitle>Disponibilidad</SectionTitle>
              </legend>
              <div className="publish-item-options">
                <OptionCard
                  icon="check_circle"
                  label="Disponible ya"
                  type="radio"
                  name="status"
                  value="published"
                  checked={status === 'published'}
                  onChange={() => setStatus('published')}
                />
                <OptionCard
                  icon="pause"
                  label="Pausado (no aparece en las búsquedas)"
                  type="radio"
                  name="status"
                  value="paused"
                  checked={status === 'paused'}
                  onChange={() => setStatus('paused')}
                />
              </div>
            </fieldset>
          </div>

          <div className="card publish-section">
            <fieldset
              className="publish-fieldset"
              aria-describedby={describedBy('deliveryModes', 'publish-item-delivery-hint')}
            >
              <legend>
                <SectionTitle>Entrega</SectionTitle>
              </legend>
              <p id="publish-item-delivery-hint" className="field-hint">
                {DELIVERY_HINT}
              </p>
              <div className="publish-item-options">
                <OptionCard
                  ref={deliveryRef}
                  icon="home"
                  label={DELIVERY_MODE_LABELS.homeDelivery}
                  type="checkbox"
                  checked={homeDelivery}
                  onChange={(event) => {
                    setHomeDelivery(event.target.checked);
                    clearError('deliveryModes');
                  }}
                />
                <OptionCard
                  icon="directions_bike"
                  label={DELIVERY_MODE_LABELS.riderDelivery}
                  type="checkbox"
                  checked={riderDelivery}
                  onChange={(event) => {
                    setRiderDelivery(event.target.checked);
                    clearError('deliveryModes');
                  }}
                />
                <OptionCard
                  icon="pin_drop"
                  label={DELIVERY_MODE_LABELS.pickupPointDelivery}
                  type="checkbox"
                  checked={pickupPointDelivery}
                  onChange={(event) => {
                    setPickupPointDelivery(event.target.checked);
                    clearError('deliveryModes');
                  }}
                />
              </div>
              {errors.deliveryModes && (
                <p id="publish-item-deliveryModes-error" className="field-error">
                  {errors.deliveryModes}
                </p>
              )}
            </fieldset>

            {showAddress ? (
              <div className="form-field">
                <label htmlFor="publish-item-address">Dirección</label>
                <input
                  id="publish-item-address"
                  ref={addressRef}
                  type="text"
                  autoComplete="street-address"
                  maxLength={ADDRESS_MAX}
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    clearError('address');
                  }}
                  aria-invalid={errors.address ? true : undefined}
                  aria-describedby={describedBy('address', 'publish-item-address-hint')}
                />
                <p id="publish-item-address-hint" className="field-hint">
                  {ADDRESS_HINT}
                </p>
                {errors.address && (
                  <p id="publish-item-address-error" className="field-error">
                    {errors.address}
                  </p>
                )}
              </div>
            ) : (
              pickupPointDelivery && <p className="field-hint">{PICKUP_ONLY_HINT}</p>
            )}
          </div>

          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </form>
    </section>
  );
}
