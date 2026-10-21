// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 18/10/2026
import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { PasswordInput } from '../components/PasswordInput';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { login } from '../services/authService';

type Field = 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

// Mismos textos que devuelve el backend (authService, #136), para que el usuario
// vea el mismo mensaje tanto si el error lo detecta el navegador como la API.
const ERROR_MESSAGES: Record<Field, string> = {
  email: 'El campo "correo electrónico" no es correcto, revísalo.',
  password: 'El campo "contraseña" no es correcto, revísalo.',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isField(value: string | undefined): value is Field {
  return value === 'email' || value === 'password';
}

// Página a la que volver tras el login: la guarda PrivateRoute (#29) en location.state.from.
function getRedirectPath(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const { from } = state;
    // Solo rutas internas: «//dominio» o «/\dominio» llevarían a otra web.
    if (
      typeof from === 'string' &&
      from.startsWith('/') &&
      !from.startsWith('//') &&
      !from.startsWith('/\\') &&
      !from.startsWith('/login')
    ) {
      return from;
    }
  }
  return '/';
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = ERROR_MESSAGES.email;
  if (password.length === 0) errors.password = ERROR_MESSAGES.password;
  return errors;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { saveSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function clearError(field: Field) {
    setErrors(({ [field]: _removed, ...rest }) => rest);
    setFormError(null);
  }

  function showFieldErrors(fieldErrors: FieldErrors) {
    setErrors(fieldErrors);
    if (fieldErrors.email) emailRef.current?.focus();
    else if (fieldErrors.password) passwordRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    const validationErrors = validate(email, password);
    showFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    try {
      const session = await login(email, password);
      saveSession(session);
      navigate(getRedirectPath(location.state), { replace: true });
    } catch (error) {
      if (error instanceof ApiError && isField(error.field)) {
        showFieldErrors({ [error.field]: error.message });
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('Ha ocurrido un error inesperado.');
      }
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>Iniciar sesión</h1>
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="login-email">Correo electrónico</label>
          <input
            id="login-email"
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
            aria-describedby={errors.email ? 'login-email-error' : undefined}
          />
          {errors.email && (
            <p id="login-email-error" className="field-error">
              {errors.email}
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="login-password">Contraseña</label>
          <PasswordInput
            id="login-password"
            ref={passwordRef}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearError('password');
            }}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
          />
          {errors.password && (
            <p id="login-password-error" className="field-error">
              {errors.password}
            </p>
          )}
        </div>

        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </button>
      </form>
    </section>
  );
}
