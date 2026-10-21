import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const error = (field: string) =>
  `El campo "${field}" no está correctamente introducido, prueba a revisarlo.`;
const USERNAME_ERROR = error('nombre de usuario');
const EMAIL_ERROR = error('correo electrónico');
const PASSWORD_ERROR = error('contraseña');

function renderRegister() {
  const user = userEvent.setup();
  renderRoute('/registro');
  return {
    user,
    username: screen.getByLabelText('Nombre de usuario'),
    email: screen.getByLabelText('Correo electrónico'),
    password: screen.getByLabelText('Contraseña'),
    submit: screen.getByRole('button', { name: 'Crear cuenta' }),
  };
}

async function fillValid(
  user: ReturnType<typeof userEvent.setup>,
  fields: { username: HTMLElement; email: HTMLElement; password: HTMLElement },
  overrides: Partial<Record<'username' | 'email' | 'password', string>> = {},
) {
  const values = {
    username: 'ana',
    email: 'ana@rentit.test',
    password: 'Rentit2026',
    ...overrides,
  };
  if (values.username) await user.type(fields.username, values.username);
  if (values.email) await user.type(fields.email, values.email);
  if (values.password) await user.type(fields.password, values.password);
}

// Con datos válidos el formulario llama a la API (#24); aquí solo se prueba la validación.
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
});
afterEach(() => localStorage.clear());

describe('formulario de registro (US-01.1, #22)', () => {
  it('muestra los campos de nombre de usuario, correo y contraseña', () => {
    const { username, email, password, submit } = renderRegister();

    expect(screen.getByRole('heading', { level: 1, name: 'Crear cuenta' })).toBeInTheDocument();
    expect(username).toHaveAttribute('type', 'text');
    expect(email).toHaveAttribute('type', 'email');
    expect(password).toHaveAttribute('type', 'password');
    expect(submit).toBeInTheDocument();
  });

  it('marca los tres campos si se envía vacío y pone el foco en el primero', async () => {
    const { user, username, email, password, submit } = renderRegister();

    await user.click(submit);

    expect(screen.getByText(USERNAME_ERROR)).toBeInTheDocument();
    expect(screen.getByText(EMAIL_ERROR)).toBeInTheDocument();
    expect(screen.getByText(PASSWORD_ERROR)).toBeInTheDocument();
    for (const field of [username, email, password]) {
      expect(field).toHaveAttribute('aria-invalid', 'true');
    }
    expect(username).toHaveFocus();
  });

  it('rechaza un nombre de usuario de menos de 3 caracteres', async () => {
    const fields = renderRegister();

    await fillValid(fields.user, fields, { username: 'an' });
    await fields.user.click(fields.submit);

    expect(screen.getByText(USERNAME_ERROR)).toBeInTheDocument();
    expect(screen.queryByText(EMAIL_ERROR)).not.toBeInTheDocument();
  });

  it('rechaza un nombre de usuario de más de 30 caracteres', async () => {
    const fields = renderRegister();

    await fillValid(fields.user, fields, { username: 'a'.repeat(31) });
    await fields.user.click(fields.submit);

    expect(screen.getByText(USERNAME_ERROR)).toBeInTheDocument();
  });

  it('rechaza un nombre de usuario con espacios, acentos o símbolos', async () => {
    for (const invalid of ['ana garcia', 'maría', 'ana@rentit']) {
      const fields = renderRegister();

      await fillValid(fields.user, fields, { username: invalid });
      await fields.user.click(fields.submit);

      expect(screen.getByText(USERNAME_ERROR)).toBeInTheDocument();
      cleanup();
    }
  });

  it('acepta un nombre de usuario con puntos, guiones y guiones bajos', async () => {
    const fields = renderRegister();

    await fillValid(fields.user, fields, { username: 'ana.garcia_92-b' });
    await fields.user.click(fields.submit);

    expect(screen.queryByText(USERNAME_ERROR)).not.toBeInTheDocument();
  });

  it('rechaza un correo sin formato válido', async () => {
    const fields = renderRegister();

    await fillValid(fields.user, fields, { email: 'ana-sin-arroba' });
    await fields.user.click(fields.submit);

    expect(screen.getByText(EMAIL_ERROR)).toBeInTheDocument();
    expect(fields.email).toHaveFocus();
  });

  it('rechaza una contraseña de menos de 8 caracteres', async () => {
    const fields = renderRegister();

    await fillValid(fields.user, fields, { password: 'corta12' });
    await fields.user.click(fields.submit);

    expect(screen.getByText(PASSWORD_ERROR)).toBeInTheDocument();
    expect(fields.password).toHaveFocus();
  });

  it('rechaza una contraseña de más de 72 bytes', async () => {
    const fields = renderRegister();

    // 37 «ñ» son 37 caracteres pero 74 bytes en UTF-8 (límite de bcrypt).
    await fillValid(fields.user, fields, { password: 'ñ'.repeat(37) });
    await fields.user.click(fields.submit);

    expect(screen.getByText(PASSWORD_ERROR)).toBeInTheDocument();
  });

  it('acepta una contraseña de 72 bytes', async () => {
    const fields = renderRegister();

    await fillValid(fields.user, fields, { password: 'a'.repeat(72) });
    await fields.user.click(fields.submit);

    expect(screen.queryByText(PASSWORD_ERROR)).not.toBeInTheDocument();
  });

  it('no muestra errores si todos los datos son válidos', async () => {
    const fields = renderRegister();

    await fillValid(fields.user, fields, { username: '  ana  ' });
    await fields.user.click(fields.submit);

    expect(screen.queryByText(USERNAME_ERROR)).not.toBeInTheDocument();
    expect(screen.queryByText(EMAIL_ERROR)).not.toBeInTheDocument();
    expect(screen.queryByText(PASSWORD_ERROR)).not.toBeInTheDocument();
  });

  it('borra el error de un campo cuando el usuario lo corrige', async () => {
    const { user, username, submit } = renderRegister();

    await user.click(submit);
    await user.type(username, 'ana');

    expect(screen.queryByText(USERNAME_ERROR)).not.toBeInTheDocument();
    expect(username).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('permite mostrar y ocultar la contraseña', async () => {
    const { user, password } = renderRegister();

    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(password).toHaveAttribute('type', 'password');
  });
});
