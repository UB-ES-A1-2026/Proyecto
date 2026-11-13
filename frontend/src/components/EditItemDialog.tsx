// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import {
  getItemDetail,
  updateItem,
  type ItemChanges,
  type ItemDetail,
} from '../services/itemService';
import { getNeighborhoods } from '../services/neighborhoodService';
import { ACCEPTED_PHOTO_TYPES, uploadItemPhoto } from '../services/photoService';
import {
  ADDRESS_HINT,
  ADDRESS_MAX,
  DELIVERY_HINT,
  DELIVERY_MODE_FIELDS,
  DELIVERY_MODE_ICONS,
  DELIVERY_MODE_LABELS,
  NO_DELIVERY_MODE_ERROR,
  PICKUP_ONLY_HINT,
  needsAddress,
  validateDelivery,
  type DeliveryModes,
} from '../utils/delivery';
import { Icon } from './Icon';
import { Modal } from './Modal';

// Fotos que se pueden añadir al editar (US-02.02, #51). Borrarlas queda para el Sprint 2.
const PHOTOS_MAX = 5;
const PHOTOS_ERROR = 'El campo "fotografías" no es correcto, revísalo.';

type TextField = 'title' | 'description' | 'dailyPrice' | 'deposit';
// Barrio, modos y dirección: apartado «Entrega» de US-05.01 (T27, #307).
type Field = TextField | 'neighborhood' | 'deliveryModes' | 'address';
type FieldErrors = Partial<Record<Field, string>>;

// En el orden de la ventana: el foco va al primer campo con error.
const FIELD_ORDER: Field[] = [
  'title',
  'description',
  'dailyPrice',
  'deposit',
  'neighborhood',
  'deliveryModes',
  'address',
];

const FIELD_NAMES: Record<Field, string> = {
  title: 'nombre',
  description: 'descripción',
  dailyPrice: 'precio por día',
  deposit: 'fianza',
  neighborhood: 'barrio',
  deliveryModes: 'modo de entrega',
  address: 'dirección',
};

// Texto del criterio de aceptación de US-02.02 (y el de US-05.01 para «sin ningún modo»).
function errorMessage(field: Field): string {
  if (field === 'deliveryModes') return NO_DELIVERY_MODE_ERROR;
  return `El campo "${FIELD_NAMES[field]}" no es correcto, revísalo.`;
}

// Límites de la tabla objeto (#86): titulo ≤ 100, descripcion ≤ 2000, precio_dia > 0,
// fianza ≥ 0, y los dos importes son Decimal(10, 2).
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 2000;
const AMOUNT_PATTERN = /^\d{1,8}([.,]\d{1,2})?$/;

function isField(value: string | undefined): value is Field {
  return FIELD_ORDER.some((field) => field === value);
}

// Acepta «5,50» o «5.50»: en España se escribe con coma decimal.
function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) return null;
  return Number(trimmed.replace(',', '.'));
}

function formatAmount(value: string): string {
  return value.replace('.', ',');
}

type FormValues = Record<TextField, string>;

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  const description = values.description.trim();
  const dailyPrice = parseAmount(values.dailyPrice);
  const deposit = parseAmount(values.deposit);

  if (title.length === 0 || title.length > TITLE_MAX) errors.title = errorMessage('title');
  if (description.length === 0 || description.length > DESCRIPTION_MAX) {
    errors.description = errorMessage('description');
  }
  if (dailyPrice === null || dailyPrice <= 0) errors.dailyPrice = errorMessage('dailyPrice');
  if (deposit === null) errors.deposit = errorMessage('deposit');
  return errors;
}

type EditItemDialogProps = {
  id: string;
  onClose: () => void;
  onSaved: (item: ItemDetail, photosFailed: boolean) => void;
};

// Formulario de edición de un objeto (#109), en una ventana sobre «Mis objetos».
export function EditItemDialog({ id, onClose, onSaved }: EditItemDialogProps) {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    getItemDetail(id, token)
      .then((data) => {
        if (!ignore) setItem(data);
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        // Sesión caducada o revocada: al borrarla, PrivateRoute lleva al login.
        if (requestError instanceof ApiError && requestError.status === 401) {
          clearSession();
        } else if (requestError instanceof ApiError) {
          setLoadError(requestError.message);
        } else {
          setLoadError('Ha ocurrido un error inesperado.');
        }
      });

    // El barrio se elige de la lista de la API (US-05.01, #307): sin ella no se puede editar.
    getNeighborhoods()
      .then((data) => {
        if (!ignore) setNeighborhoods(data);
      })
      .catch(() => {
        if (!ignore) setLoadError('No se han podido cargar los barrios.');
      });

    return () => {
      ignore = true;
    };
  }, [token, id, clearSession]);

  return (
    <Modal title="Editar objeto" onClose={onClose}>
      {loadError ? (
        <>
          <p role="alert" className="form-error manage-notice">
            <Icon name="error" />
            {loadError}
          </p>
          <button type="button" className="button-secondary" onClick={onClose}>
            Cerrar
          </button>
        </>
      ) : item && neighborhoods && token ? (
        <EditItemForm
          item={item}
          neighborhoods={neighborhoods}
          token={token}
          onCancel={onClose}
          onSaved={onSaved}
        />
      ) : (
        <>
          <p className="manage-visually-hidden">Cargando el objeto…</p>
          <div className="edit-item-skeleton" aria-hidden="true">
            <div className="skeleton manage-skeleton-title" />
            <div className="skeleton edit-item-skeleton-input" />
            <div className="skeleton manage-skeleton-title" />
            <div className="skeleton edit-item-skeleton-textarea" />
          </div>
        </>
      )}
    </Modal>
  );
}

// Miniatura de una foto aún sin subir. La URL temporal se libera al quitarla o al cerrar la ventana.
function NewPhotoThumbnail({ file }: { file: File }) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return <img ref={imageRef} alt={`Vista previa de ${file.name}`} />;
}

type EditItemFormProps = {
  item: ItemDetail;
  neighborhoods: string[];
  token: string;
  onCancel: () => void;
  onSaved: (item: ItemDetail, photosFailed: boolean) => void;
};

function EditItemForm({ item, neighborhoods, token, onCancel, onSaved }: EditItemFormProps) {
  const [values, setValues] = useState<FormValues>({
    title: item.title,
    description: item.description,
    dailyPrice: formatAmount(item.dailyPrice),
    deposit: formatAmount(item.deposit),
  });
  // Un barrio de antes de US-05.01 que no está en la lista empieza vacío y obliga a elegir (A3).
  const oldNeighborhood = neighborhoods.includes(item.neighborhood) ? null : item.neighborhood;
  const [neighborhood, setNeighborhood] = useState(
    oldNeighborhood === null ? item.neighborhood : '',
  );
  const [modes, setModes] = useState<DeliveryModes>({
    homeDelivery: item.homeDelivery,
    riderDelivery: item.riderDelivery,
    pickupPointDelivery: item.pickupPointDelivery,
  });
  const [address, setAddress] = useState(item.address ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [photosError, setPhotosError] = useState(false);
  const { clearSession } = useAuth();
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const dailyPriceRef = useRef<HTMLInputElement>(null);
  const depositRef = useRef<HTMLInputElement>(null);
  const neighborhoodRef = useRef<HTMLSelectElement>(null);
  const deliveryRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const showAddress = needsAddress(modes);

  function clearError(field: Field) {
    setErrors(({ [field]: _removed, ...rest }) => rest);
    setFormError(null);
  }

  function setValue(field: TextField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    clearError(field);
  }

  function toggleMode(mode: keyof DeliveryModes, checked: boolean) {
    setModes((current) => ({ ...current, [mode]: checked }));
    clearError('deliveryModes');
  }

  // Solo se envía lo del apartado «Entrega» que ha cambiado: el PATCH deja igual lo demás.
  function deliveryChanges(): Partial<ItemChanges> {
    const changes: Partial<ItemChanges> = {};
    if (neighborhood !== item.neighborhood) changes.neighborhood = neighborhood;
    for (const mode of DELIVERY_MODE_FIELDS) {
      if (modes[mode] !== item[mode]) changes[mode] = modes[mode];
    }
    if (showAddress && address.trim() !== (item.address ?? '')) changes.address = address.trim();
    return changes;
  }

  function addPhotos(files: FileList | null) {
    const next = [...newPhotos, ...Array.from(files ?? [])];
    const allowed = ACCEPTED_PHOTO_TYPES.split(',');
    const invalid =
      item.photos.length + next.length > PHOTOS_MAX ||
      next.some((photo) => !allowed.includes(photo.type));

    setPhotosError(invalid);
    if (!invalid) setNewPhotos(next);
  }

  // Muestra los errores y pone el foco en el primer campo que falla. Devuelve si había alguno.
  function showFieldErrors(fieldErrors: FieldErrors): boolean {
    setErrors(fieldErrors);
    const firstInvalid = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!firstInvalid) return false;

    const refs = {
      title: titleRef,
      description: descriptionRef,
      dailyPrice: dailyPriceRef,
      deposit: depositRef,
      neighborhood: neighborhoodRef,
      deliveryModes: deliveryRef,
      address: addressRef,
    };
    refs[firstInvalid].current?.focus();
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    const localErrors: FieldErrors = {
      ...validate(values),
      ...(neighborhood === '' ? { neighborhood: errorMessage('neighborhood') } : {}),
      ...validateDelivery(modes, address),
    };
    if (showFieldErrors(localErrors)) return;

    setSubmitting(true);
    try {
      const saved = await updateItem(token, item.id, {
        title: values.title.trim(),
        description: values.description.trim(),
        dailyPrice: parseAmount(values.dailyPrice) ?? 0,
        deposit: parseAmount(values.deposit) ?? 0,
        ...deliveryChanges(),
      });

      // Los cambios ya están guardados: si falla una foto se avisa, pero no se pierden.
      let photosFailed = false;
      const uploaded: ItemDetail['photos'] = [];
      for (const photo of newPhotos) {
        try {
          uploaded.push(await uploadItemPhoto(item.id, photo, token));
        } catch (photoError) {
          if (photoError instanceof ApiError && photoError.status === 401) {
            clearSession();
            return;
          }
          photosFailed = true;
        }
      }
      onSaved({ ...saved, photos: [...saved.photos, ...uploaded] }, photosFailed);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return;
      }
      if (error instanceof ApiError && isField(error.field)) {
        showFieldErrors({ [error.field]: errorMessage(error.field) });
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('Ha ocurrido un error inesperado.');
      }
      setSubmitting(false);
    }
  }

  function describedBy(field: Field, hint?: string) {
    const ids = [hint, errors[field] ? `item-${field}-error` : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : undefined;
  }

  function fieldError(field: Field) {
    return (
      errors[field] && (
        <p id={`item-${field}-error`} className="field-error">
          {errors[field]}
        </p>
      )
    );
  }

  return (
    <>
      {formError && (
        <p role="alert" className="form-error manage-notice">
          <Icon name="error" />
          {formError}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="item-title">Nombre</label>
          <input
            id="item-title"
            ref={titleRef}
            type="text"
            name="title"
            value={values.title}
            onChange={(event) => setValue('title', event.target.value)}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describedBy('title', 'item-title-hint')}
          />
          <p id="item-title-hint" className="field-hint">
            Máximo {TITLE_MAX} caracteres.
          </p>
          {fieldError('title')}
        </div>

        <div className="form-field">
          <label htmlFor="item-description">Descripción</label>
          <textarea
            id="item-description"
            ref={descriptionRef}
            name="description"
            rows={5}
            value={values.description}
            onChange={(event) => setValue('description', event.target.value)}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={describedBy('description', 'item-description-hint')}
          />
          <p id="item-description-hint" className="field-hint">
            Máximo {DESCRIPTION_MAX} caracteres.
          </p>
          {fieldError('description')}
        </div>

        <div className="edit-item-amounts">
          <div className="form-field">
            <label htmlFor="item-dailyPrice">Precio por día (€)</label>
            <input
              id="item-dailyPrice"
              ref={dailyPriceRef}
              type="text"
              inputMode="decimal"
              name="dailyPrice"
              value={values.dailyPrice}
              onChange={(event) => setValue('dailyPrice', event.target.value)}
              aria-invalid={errors.dailyPrice ? true : undefined}
              aria-describedby={describedBy('dailyPrice', 'item-dailyPrice-hint')}
            />
            <p id="item-dailyPrice-hint" className="field-hint">
              Mayor que 0, con hasta 2 decimales. Por ejemplo, 5,50.
            </p>
            {fieldError('dailyPrice')}
          </div>

          <div className="form-field">
            <label htmlFor="item-deposit">Fianza (€)</label>
            <input
              id="item-deposit"
              ref={depositRef}
              type="text"
              inputMode="decimal"
              name="deposit"
              value={values.deposit}
              onChange={(event) => setValue('deposit', event.target.value)}
              aria-invalid={errors.deposit ? true : undefined}
              aria-describedby={describedBy('deposit', 'item-deposit-hint')}
            />
            <p id="item-deposit-hint" className="field-hint">
              0 si no pides fianza.
            </p>
            {fieldError('deposit')}
          </div>
        </div>

        <div className="form-field">
          {/* El campo cubre toda la zona: así se puede pulsar o soltar encima las fotos. */}
          <div className="photo-picker">
            <input
              id="item-photos"
              type="file"
              multiple
              accept={ACCEPTED_PHOTO_TYPES}
              onChange={(event) => {
                addPhotos(event.target.files);
                event.target.value = '';
              }}
              aria-invalid={photosError ? true : undefined}
              aria-describedby={`item-photos-hint${photosError ? ' item-photos-error' : ''}`}
            />
            <label htmlFor="item-photos">
              <Icon name="add_photo_alternate" size="1.75rem" />
              Añadir fotografías
            </label>
          </div>
          <p id="item-photos-hint" className="field-hint">
            Tiene {item.photos.length} de {PHOTOS_MAX} fotos. JPG, PNG o WebP, de 5 MB como máximo.
          </p>
          {photosError && (
            <p id="item-photos-error" className="field-error">
              {PHOTOS_ERROR}
            </p>
          )}
          {item.photos.length + newPhotos.length > 0 && (
            <ul className="edit-item-photos">
              {item.photos.map((photo, index) => (
                <li key={photo.id} className="edit-item-photo">
                  <img src={photo.url} alt={`Foto ${index + 1} de ${item.title}`} />
                </li>
              ))}
              {newPhotos.map((photo, index) => (
                <li key={`${photo.name}-${index}`} className="edit-item-photo">
                  <NewPhotoThumbnail file={photo} />
                  <span className="edit-item-photo-name" title={photo.name}>
                    {photo.name}
                  </span>
                  <button
                    type="button"
                    className="edit-item-photo-remove"
                    aria-label={`Quitar ${photo.name}`}
                    onClick={() => {
                      setNewPhotos((current) =>
                        current.filter((_, position) => position !== index),
                      );
                      setPhotosError(false);
                    }}
                  >
                    <Icon name="close" size="1rem" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Apartado «Entrega» de US-05.01 (T27, #307): barrio de la lista, modos y dirección. */}
        <div className="form-field">
          <label htmlFor="item-neighborhood">Barrio</label>
          <select
            id="item-neighborhood"
            ref={neighborhoodRef}
            name="neighborhood"
            value={neighborhood}
            onChange={(event) => {
              setNeighborhood(event.target.value);
              clearError('neighborhood');
            }}
            aria-invalid={errors.neighborhood ? true : undefined}
            aria-describedby={describedBy(
              'neighborhood',
              oldNeighborhood === null ? undefined : 'item-neighborhood-hint',
            )}
          >
            <option value="">Elige un barrio</option>
            {neighborhoods.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {oldNeighborhood !== null && (
            <p id="item-neighborhood-hint" className="field-hint">
              Antes ponía «{oldNeighborhood}», que no está en la lista. Elige el barrio de la lista.
            </p>
          )}
          {fieldError('neighborhood')}
        </div>

        <fieldset
          className="publish-fieldset"
          aria-describedby={describedBy('deliveryModes', 'item-delivery-hint')}
        >
          <legend>Entrega</legend>
          <p id="item-delivery-hint" className="field-hint">
            {DELIVERY_HINT}
          </p>
          <div className="publish-item-options">
            {DELIVERY_MODE_FIELDS.map((mode, index) => (
              <label key={mode} className="publish-option">
                <span className="publish-option-icon">
                  <Icon name={DELIVERY_MODE_ICONS[mode]} />
                </span>
                <span className="publish-option-text">{DELIVERY_MODE_LABELS[mode]}</span>
                <input
                  ref={index === 0 ? deliveryRef : undefined}
                  type="checkbox"
                  name={mode}
                  checked={modes[mode]}
                  onChange={(event) => toggleMode(mode, event.target.checked)}
                />
              </label>
            ))}
          </div>
          {fieldError('deliveryModes')}
        </fieldset>

        {showAddress ? (
          <div className="form-field">
            <label htmlFor="item-address">Dirección</label>
            <input
              id="item-address"
              ref={addressRef}
              type="text"
              name="address"
              autoComplete="street-address"
              maxLength={ADDRESS_MAX}
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                clearError('address');
              }}
              aria-invalid={errors.address ? true : undefined}
              aria-describedby={describedBy('address', 'item-address-hint')}
            />
            <p id="item-address-hint" className="field-hint">
              {address.trim() === ''
                ? `Añade tu dirección: sin ella, nadie puede elegir «${DELIVERY_MODE_LABELS.homeDelivery}».`
                : ADDRESS_HINT}
            </p>
            {fieldError('address')}
          </div>
        ) : (
          modes.pickupPointDelivery && <p className="field-hint">{PICKUP_ONLY_HINT}</p>
        )}

        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
