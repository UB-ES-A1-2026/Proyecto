import { useState, type ComponentProps } from 'react';

type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'>;

// Campo de contraseña con botón para mostrar u ocultar el texto (US-01.1 y US-01.2).
// Se usa en el login (#25) y en el registro (#22).
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}
