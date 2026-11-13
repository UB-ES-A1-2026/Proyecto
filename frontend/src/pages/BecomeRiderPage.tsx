// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// «Hazte rider» (US-10.03, T35 #315): cuestionario para pedir una cuenta de rider, sin sesión.
// Wireframe: docs/wireframes/US-10.03-hazte-rider (pantallas 2, 3 y 4).
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { PasswordInput } from '../components/PasswordInput';
import { ApiError } from '../services/apiClient';
import {
  RIDER_SLOTS,
  RIDER_VEHICLES,
  RIDER_WEEKDAYS,
  applyAsRider,
  type RiderSlot,
  type RiderVehicle,
  type RiderWeekday,
} from '../services/riderService';

type Field =
  | 'username'
  | 'email'
  | 'password'
  | 'phone'
  | 'zone'
  | 'vehicle'
  | 'days'
  | 'slots'
  | 'acceptedTerms';
type FieldErrors = Partial<Record<Field, string>>;

const FIELD_ORDER: Field[] = [
  'username',
  'email',
  'password',
  'phone',
  'zone',
  'vehicle',
  'days',
  'slots',
  'acceptedTerms',
];

function isField(value: string | undefined): value is Field {
  return FIELD_ORDER.some((field) => field === value);
}

// Mismos textos que la API (accountFields.ts y riderBody.ts, #322): la cuenta usa los del registro
// (US-01.1) y el cuestionario los suyos.
const accountError = (label: string) =>
  `El campo "${label}" no está correctamente introducido, prueba a revisarlo.`;
const questionError = (label: string) => `El campo "${label}" no es correcto, revísalo.`;
const TERMS_ERROR = 'Tienes que aceptar las condiciones.';

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(?:\+34|0034)?\d{9}$/;
const PASSWORD_MAX_BYTES = 72;

type Values = {
  username: string;
  email: string;
  password: string;
  phone: string;
  zone: string;
  vehicle: RiderVehicle | '';
  days: RiderWeekday[];
  slots: RiderSlot[];
  acceptedTerms: boolean;
};

const EMPTY_VALUES: Values = {
  username: '',
  email: '',
  password: '',
  phone: '',
  zone: '',
  vehicle: '',
  days: [],
  slots: [],
  acceptedTerms: false,
};

function validate(values: Values): FieldErrors {
  const errors: FieldErrors = {};
  const email = values.email.trim();
  const zone = values.zone.trim();

  if (!USERNAME_PATTERN.test(values.username.trim()))
    errors.username = accountError('nombre de usuario');
  if (!EMAIL_PATTERN.test(email) || email.length > 255)
    errors.email = accountError('correo electrónico');
  if (
    values.password.length < 8 ||
    new TextEncoder().encode(values.password).length > PASSWORD_MAX_BYTES
  ) {
    errors.password = accountError('contraseña');
  }
  if (!PHONE_PATTERN.test(values.phone.replace(/\s+/g, '')))
    errors.phone = questionError('teléfono');
  if (zone.length < 2 || zone.length > 100) errors.zone = questionError('zona');
  if (values.vehicle === '') errors.vehicle = questionError('vehículo');
  if (values.days.length === 0) errors.days = questionError('días');
  if (values.slots.length === 0) errors.slots = questionError('franjas');
  if (!values.acceptedTerms) errors.acceptedTerms = TERMS_ERROR;
  return errors;
}

// Condiciones para riders (decisión de Marc del 13/11): texto breve, desplegable en el formulario.
const RIDER_TERMS = [
  'Colaboras de forma independiente y voluntaria: eliges cuándo y qué trabajos haces.',
  'Cobras por cada trabajo hecho: la tarifa de entrega que se muestra al aceptarlo.',
  'Cuidas los objetos y los entregas a tiempo, en el estado en que los recoges.',
  'Solo marcas un objeto como entregado con el código que te da quien lo recibe.',
  'Tus datos se usan solo para gestionar las entregas.',
  'Puedes darte de baja cuando quieras.',
  'Rentit puede desactivar tu cuenta si no cumples estas condiciones.',
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function BecomeRiderPage() {
  const [values, setValues] = useState<Values>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<{ message: string; email: string } | null>(null);
  const fieldRefs = useRef<Partial<Record<Field, HTMLElement | null>>>({});

  function update<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
    setFormError(null);
  }

  // Enseña los errores y lleva el foco al primer campo que falla. Devuelve si había alguno.
  function showFieldErrors(fieldErrors: FieldErrors): boolean {
    setErrors(fieldErrors);
    const firstInvalid = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!firstInvalid) return false;
    fieldRefs.current[firstInvalid]?.focus();
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    if (showFieldErrors(validate(values))) return;

    setSubmitting(true);
    try {
      const result = await applyAsRider(values);
      setSent({ message: result.message, email: values.email.trim() });
    } catch (error) {
      // Los errores de un campo (400 y 409) llevan el texto exacto de la API.
      if (error instanceof ApiError && isField(error.field)) {
        showFieldErrors({ [error.field]: error.message });
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('Ha ocurrido un error inesperado.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function describedBy(field: Field, hint?: string) {
    const ids = [hint, errors[field] ? `rider-${field}-error` : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : undefined;
  }

  function fieldError(field: Field) {
    return errors[field] ? (
      <p id={`rider-${field}-error`} className="field-error">
        {errors[field]}
      </p>
    ) : null;
  }

  if (sent) {
    return (
      <section className="auth-card card">
        <header className="auth-card-header">
          <img className="auth-logo" src="/favicon.svg" alt="" width={56} height={56} />
          <h1>Solicitud enviada</h1>
        </header>
        <p role="status" className="form-success">
          {sent.message}
        </p>
        <p>
          Tu cuenta queda «Pendiente de revisión». Puedes iniciar sesión con tu correo para ver cómo
          va.
        </p>
        <div className="rider-signup-actions">
          <Link to="/login" state={{ email: sent.email }} className="button-primary">
            Iniciar sesión
          </Link>
          <Link to="/" className="button-secondary">
            Volver al inicio
          </Link>
        </div>
      </section>
    );
  }

  const textField = (
    field: 'username' | 'email' | 'phone' | 'zone',
    label: string,
    options: { type: string; autoComplete: string; hint?: string },
  ) => (
    <div className="form-field">
      <label htmlFor={`rider-${field}`}>{label}</label>
      <div className="auth-input">
        <input
          id={`rider-${field}`}
          ref={(element) => {
            fieldRefs.current[field] = element;
          }}
          type={options.type}
          name={field}
          autoComplete={options.autoComplete}
          value={values[field]}
          onChange={(event) => update(field, event.target.value)}
          aria-invalid={errors[field] ? true : undefined}
          aria-describedby={describedBy(field, options.hint ? `rider-${field}-hint` : undefined)}
        />
      </div>
      {options.hint && (
        <p id={`rider-${field}-hint`} className="field-hint">
          {options.hint}
        </p>
      )}
      {fieldError(field)}
    </div>
  );

  return (
    <div className="rider-signup">
      <aside className="card rider-signup-info">
        <h1>Hazte rider</h1>
        <p className="auth-tagline">
          Lleva objetos entre vecinos de tu barrio cuando te vaya bien.
        </p>
        <p>
          <strong>Qué hace un rider:</strong> recoge el objeto en casa del propietario y lo entrega
          a quien lo alquila.
        </p>
        {/* Decisión de Marc (13/11), a confirmar por el equipo: el rider cobra la tarifa de entrega
            de US-05.01, que paga el arrendatario según la distancia. */}
        <p>
          <strong>Cuánto cobras:</strong> la tarifa de entrega de cada trabajo, de 3 a 7 € según la
          distancia.
        </p>
        <p>
          <strong>Requisitos:</strong> mayor de edad, móvil y un medio para moverte.
        </p>
        <p className="field-hint">
          La cuenta de rider es aparte: no sirve para alquilar ni publicar objetos.
        </p>
      </aside>

      <section className="card rider-signup-form">
        <h2>Tu solicitud</h2>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <form onSubmit={handleSubmit} noValidate>
          {textField('username', 'Nombre de usuario', {
            type: 'text',
            autoComplete: 'username',
            hint: 'Entre 3 y 30 caracteres: letras sin acentos, números, «.», «_» o «-».',
          })}
          {textField('email', 'Correo electrónico', { type: 'email', autoComplete: 'email' })}

          <div className="form-field">
            <label htmlFor="rider-password">Contraseña</label>
            <div className="auth-input">
              <PasswordInput
                id="rider-password"
                ref={(element) => {
                  fieldRefs.current.password = element;
                }}
                name="password"
                autoComplete="new-password"
                value={values.password}
                onChange={(event) => update('password', event.target.value)}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={describedBy('password', 'rider-password-hint')}
              />
            </div>
            <p id="rider-password-hint" className="field-hint">
              Mínimo 8 caracteres. Máximo 72 (las letras con acento cuentan como 2).
            </p>
            {fieldError('password')}
          </div>

          {textField('phone', 'Teléfono', {
            type: 'tel',
            autoComplete: 'tel',
            hint: '9 cifras. Puedes poner +34 delante.',
          })}
          {textField('zone', 'Zona en la que quieres repartir', {
            type: 'text',
            autoComplete: 'off',
            hint: 'Entre 2 y 100 caracteres.',
          })}

          <fieldset
            className="publish-fieldset form-field"
            aria-describedby={errors.vehicle ? 'rider-vehicle-error' : undefined}
          >
            <legend>Vehículo</legend>
            <div className="rider-options">
              {RIDER_VEHICLES.map((option, index) => (
                <label key={option.value} className="publish-option">
                  <input
                    ref={
                      index === 0
                        ? (element) => {
                            fieldRefs.current.vehicle = element;
                          }
                        : undefined
                    }
                    type="radio"
                    name="vehicle"
                    value={option.value}
                    checked={values.vehicle === option.value}
                    onChange={() => update('vehicle', option.value)}
                  />
                  <span className="publish-option-text">{option.label}</span>
                </label>
              ))}
            </div>
            {fieldError('vehicle')}
          </fieldset>

          <fieldset
            className="publish-fieldset form-field"
            aria-describedby={describedBy('days', 'rider-days-hint')}
          >
            <legend>Días que puedes repartir</legend>
            <div className="rider-options">
              {RIDER_WEEKDAYS.map((option, index) => (
                <label key={option.value} className="publish-option">
                  <input
                    ref={
                      index === 0
                        ? (element) => {
                            fieldRefs.current.days = element;
                          }
                        : undefined
                    }
                    type="checkbox"
                    name="days"
                    value={option.value}
                    checked={values.days.includes(option.value)}
                    onChange={() => update('days', toggle(values.days, option.value))}
                  />
                  <span className="publish-option-text">{option.label}</span>
                </label>
              ))}
            </div>
            <p id="rider-days-hint" className="field-hint">
              Marca al menos uno.
            </p>
            {fieldError('days')}
          </fieldset>

          <fieldset
            className="publish-fieldset form-field"
            aria-describedby={describedBy('slots', 'rider-slots-hint')}
          >
            <legend>Franjas</legend>
            <div className="rider-options">
              {RIDER_SLOTS.map((option, index) => (
                <label key={option.value} className="publish-option">
                  <input
                    ref={
                      index === 0
                        ? (element) => {
                            fieldRefs.current.slots = element;
                          }
                        : undefined
                    }
                    type="checkbox"
                    name="slots"
                    value={option.value}
                    checked={values.slots.includes(option.value)}
                    onChange={() => update('slots', toggle(values.slots, option.value))}
                  />
                  <span className="publish-option-text">{option.label}</span>
                </label>
              ))}
            </div>
            <p id="rider-slots-hint" className="field-hint">
              Marca al menos una.
            </p>
            {fieldError('slots')}
          </fieldset>

          <details className="rider-terms">
            <summary>Condiciones para riders</summary>
            <ul>
              {RIDER_TERMS.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ul>
          </details>

          <div className="form-field">
            <label className="publish-option">
              <input
                ref={(element) => {
                  fieldRefs.current.acceptedTerms = element;
                }}
                type="checkbox"
                name="acceptedTerms"
                checked={values.acceptedTerms}
                onChange={(event) => update('acceptedTerms', event.target.checked)}
                aria-invalid={errors.acceptedTerms ? true : undefined}
                aria-describedby={describedBy('acceptedTerms')}
              />
              <span className="publish-option-text">
                He leído y acepto las condiciones para riders
              </span>
            </label>
            {fieldError('acceptedTerms')}
          </div>

          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Enviando solicitud…' : 'Enviar solicitud'}
          </button>
        </form>
        <p className="auth-switch">
          ¿Ya has enviado tu solicitud? <Link to="/login">Inicia sesión</Link> para ver cómo va.
        </p>
      </section>
    </div>
  );
}
