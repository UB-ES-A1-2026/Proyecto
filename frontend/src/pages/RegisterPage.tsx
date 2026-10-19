// Generado con asistencia de IA (Claude) – revisado por Max Jaume, 18/10/2026 y 19/10/2026
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { PasswordInput } from '../components/PasswordInput';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { register } from '../services/authService';

type Field = 'username' | 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const FIELD_ORDER: Field[] = ['username', 'email', 'password'];

const FIELD_NAMES: Record<Field, string> = {
  username: 'nombre de usuario',
  email: 'correo electrónico',
  password: 'contraseña',
};

// Texto del criterio de aceptación de US-01.1.
function errorMessage(field: Field): string {
  return `El campo "${FIELD_NAMES[field]}" no está correctamente introducido, prueba a revisarlo.`;
}

// Mismas reglas que el backend (#23): nombre de usuario de 3 a 30 caracteres sin acentos ni
// espacios, email ≤ 255 y contraseña de 8 caracteres a 72 bytes (límite de bcrypt).
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MAX_BYTES = 72;

function isField(value: string | undefined): value is Field {
  return value === 'username' || value === 'email' || value === 'password';
}

function validate(username: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim();

  if (!USERNAME_PATTERN.test(trimmedUsername)) errors.username = errorMessage('username');
  if (!EMAIL_PATTERN.test(trimmedEmail) || trimmedEmail.length > 255) {
    errors.email = errorMessage('email');
  }
  if (password.length < 8 || new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    errors.password = errorMessage('password');
  }
  return errors;
}

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { saveSession } = useAuth();
  const navigate = useNavigate();
  const usernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function clearError(field: Field) {
    setErrors(({ [field]: _removed, ...rest }) => rest);
    setFormError(null);
  }

  // Muestra los errores y pone el foco en el primer campo que falla. Devuelve si había alguno.
  function showFieldErrors(fieldErrors: FieldErrors): boolean {
    setErrors(fieldErrors);
    const firstInvalid = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!firstInvalid) return false;

    const refs = { username: usernameRef, email: emailRef, password: passwordRef };
    refs[firstInvalid].current?.focus();
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    if (showFieldErrors(validate(username, email, password))) return;

    setSubmitting(true);
    try {
      const session = await register(username, email, password);
      saveSession(session);
      navigate('/', { replace: true });
    } catch (error) {
      // US-01.1 pide el mismo texto para un dato inválido y para un correo ya registrado (409).
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
    const ids = [hint, errors[field] ? `register-${field}-error` : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : undefined;
  }

  return (
    <section className="auth-card">
      <h1>Crear cuenta</h1>
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="register-username">Nombre de usuario</label>
          <input
            id="register-username"
            ref={usernameRef}
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              clearError('username');
            }}
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={describedBy('username', 'register-username-hint')}
          />
          <p id="register-username-hint" className="field-hint">
            Entre 3 y 30 caracteres: letras sin acentos, números, «.», «_» o «-».
          </p>
          {errors.username && (
            <p id="register-username-error" className="field-error">
              {errors.username}
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="register-email">Correo electrónico</label>
          <input
            id="register-email"
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearError('email');
            }}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy('email')}
          />
          {errors.email && (
            <p id="register-email-error" className="field-error">
              {errors.email}
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="register-password">Contraseña</label>
          <PasswordInput
            id="register-password"
            ref={passwordRef}
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearError('password');
            }}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={describedBy('password', 'register-password-hint')}
          />
          <p id="register-password-hint" className="field-hint">
            Mínimo 8 caracteres. Máximo 72 (las letras con acento cuentan como 2).
          </p>
          {errors.password && (
            <p id="register-password-error" className="field-error">
              {errors.password}
            </p>
          )}
        </div>

        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </section>
  );
}
