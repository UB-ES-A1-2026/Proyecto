// Generado con asistencia de IA (Claude) – revisado por Max Jaume, 18/10/2026
import { useRef, useState, type FormEvent } from 'react';
import { PasswordInput } from '../components/PasswordInput';

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

// Límites de docs/modelo-datos.md: nombre_usuario 3-30, email ≤ 255, contraseña ≥ 8.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(username: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim();

  if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
    errors.username = errorMessage('username');
  }
  if (!EMAIL_PATTERN.test(trimmedEmail) || trimmedEmail.length > 255) {
    errors.email = errorMessage('email');
  }
  if (password.length < 8) errors.password = errorMessage('password');
  return errors;
}

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const usernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function clearError(field: Field) {
    setErrors(({ [field]: _removed, ...rest }) => rest);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validate(username, email, password);
    setErrors(validationErrors);

    const firstInvalid = FIELD_ORDER.find((field) => validationErrors[field]);
    if (firstInvalid) {
      const refs = { username: usernameRef, email: emailRef, password: passwordRef };
      refs[firstInvalid].current?.focus();
      return;
    }

    // La llamada a la API de registro y el acceso a la home llegan en #24.
  }

  function describedBy(field: Field, hint?: string) {
    const ids = [hint, errors[field] ? `register-${field}-error` : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : undefined;
  }

  return (
    <section className="auth-card">
      <h1>Crear cuenta</h1>
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
            Entre 3 y 30 caracteres.
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
            Mínimo 8 caracteres.
          </p>
          {errors.password && (
            <p id="register-password-error" className="field-error">
              {errors.password}
            </p>
          )}
        </div>

        <button type="submit" className="button-primary">
          Crear cuenta
        </button>
      </form>
    </section>
  );
}
