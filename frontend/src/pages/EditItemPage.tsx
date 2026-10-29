// Generado con asistencia de IA (Claude) – revisado por <nombre>, <fecha>
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getItem, updateItem, type ItemDetail } from '../services/itemService';

type Field = 'title' | 'description' | 'dailyPrice' | 'deposit';
type FieldErrors = Partial<Record<Field, string>>;

const FIELD_ORDER: Field[] = ['title', 'description', 'dailyPrice', 'deposit'];

const FIELD_NAMES: Record<Field, string> = {
  title: 'nombre',
  description: 'descripción',
  dailyPrice: 'precio por día',
  deposit: 'fianza',
};

// Texto del criterio de aceptación de US-02.02.
function errorMessage(field: Field): string {
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

type FormValues = Record<Field, string>;

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

// Formulario de edición de un objeto (#109). Solo se muestra dentro de PrivateRoute.
export function EditItemPage() {
  const { id = '' } = useParams();
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    getItem(token, id)
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

    return () => {
      ignore = true;
    };
  }, [token, id, clearSession]);

  return (
    <section className="item-form-card">
      <h1>Editar objeto</h1>
      {loadError ? (
        <>
          <p role="alert" className="form-error">
            {loadError}
          </p>
          <Link to="/mis-objetos">Volver a Mis objetos</Link>
        </>
      ) : item && token ? (
        <EditItemForm item={item} token={token} />
      ) : (
        <p>Cargando el objeto…</p>
      )}
    </section>
  );
}

type EditItemFormProps = { item: ItemDetail; token: string };

function EditItemForm({ item, token }: EditItemFormProps) {
  const [values, setValues] = useState<FormValues>({
    title: item.title,
    description: item.description,
    dailyPrice: formatAmount(item.dailyPrice),
    deposit: formatAmount(item.deposit),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { clearSession } = useAuth();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const dailyPriceRef = useRef<HTMLInputElement>(null);
  const depositRef = useRef<HTMLInputElement>(null);

  function setValue(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
    setFormError(null);
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
    };
    refs[firstInvalid].current?.focus();
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    if (showFieldErrors(validate(values))) return;

    setSubmitting(true);
    try {
      await updateItem(token, item.id, {
        title: values.title.trim(),
        description: values.description.trim(),
        dailyPrice: parseAmount(values.dailyPrice) ?? 0,
        deposit: parseAmount(values.deposit) ?? 0,
      });
      navigate('/mis-objetos', { state: { message: 'Los cambios se han guardado.' } });
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
        <p role="alert" className="form-error">
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
            rows={6}
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

        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
          <Link to="/mis-objetos" className="button-secondary">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  );
}
