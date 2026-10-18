import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoute } from './renderRoute';

const EMAIL_ERROR = 'El campo "correo electrónico" no es correcto, revísalo.';
const PASSWORD_ERROR = 'El campo "contraseña" no es correcto, revísalo.';

function renderLogin() {
  const user = userEvent.setup();
  renderRoute('/login');
  return {
    user,
    email: screen.getByLabelText('Correo electrónico'),
    password: screen.getByLabelText('Contraseña'),
    submit: screen.getByRole('button', { name: 'Iniciar sesión' }),
  };
}

describe('formulario de inicio de sesión (US-01.2)', () => {
  it('muestra los campos de correo electrónico y contraseña', () => {
    const { email, password, submit } = renderLogin();

    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(email).toHaveAttribute('type', 'email');
    expect(password).toHaveAttribute('type', 'password');
    expect(submit).toBeInTheDocument();
  });

  it('marca el correo si está vacío', async () => {
    const { user, email, password, submit } = renderLogin();

    await user.type(password, 'Rentit2026');
    await user.click(submit);

    expect(screen.getByText(EMAIL_ERROR)).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveFocus();
  });

  it('marca el correo si no tiene un formato válido', async () => {
    const { user, email, password, submit } = renderLogin();

    await user.type(email, 'ana-sin-arroba');
    await user.type(password, 'Rentit2026');
    await user.click(submit);

    expect(screen.getByText(EMAIL_ERROR)).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
  });

  it('marca la contraseña si está vacía', async () => {
    const { user, email, password, submit } = renderLogin();

    await user.type(email, 'ana@rentit.test');
    await user.click(submit);

    expect(screen.getByText(PASSWORD_ERROR)).toBeInTheDocument();
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(email).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('no muestra errores si los dos campos son válidos', async () => {
    const { user, email, password, submit } = renderLogin();

    await user.type(email, '  ana@rentit.test ');
    await user.type(password, 'Rentit2026');
    await user.click(submit);

    expect(screen.queryByText(EMAIL_ERROR)).not.toBeInTheDocument();
    expect(screen.queryByText(PASSWORD_ERROR)).not.toBeInTheDocument();
  });

  it('borra el error de un campo cuando el usuario lo corrige', async () => {
    const { user, email, password, submit } = renderLogin();

    await user.type(password, 'Rentit2026');
    await user.click(submit);
    expect(screen.getByText(EMAIL_ERROR)).toBeInTheDocument();

    await user.type(email, 'ana@rentit.test');

    expect(screen.queryByText(EMAIL_ERROR)).not.toBeInTheDocument();
    expect(email).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('permite mostrar y ocultar la contraseña', async () => {
    const { user, password } = renderLogin();

    await user.type(password, 'Rentit2026');
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('Rentit2026');

    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(password).toHaveAttribute('type', 'password');
  });
});
