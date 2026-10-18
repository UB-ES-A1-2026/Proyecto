// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 18/10/2026
import { useRef, useState, type FormEvent } from 'react';
import { PasswordInput } from '../components/PasswordInput';

type Field = 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

// Mismos textos que devuelve el backend (authService, #136), para que el usuario
// vea el mismo mensaje tanto si el error lo detecta el navegador como la API.
const ERROR_MESSAGES: Record<Field, string> = {
  email: 'El campo "correo electrónico" no es correcto, revísalo.',
  password: 'El campo "contraseña" no es correcto, revísalo.',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function clearError(field: Field) {
    setErrors(({ [field]: _removed, ...rest }) => rest);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validate(email, password);
    setErrors(validationErrors);

    if (validationErrors.email) {
      emailRef.current?.focus();
      return;
    }
    if (validationErrors.password) {
      passwordRef.current?.focus();
      return;
    }

    // La llamada a POST /api/auth/login y el guardado del token llegan en #27.
  }

  return (
    <section className="auth-card">
      <h1>Iniciar sesión</h1>
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

        <button type="submit" className="button-primary">
          Iniciar sesión
        </button>
      </form>
    </section>
  );
}
