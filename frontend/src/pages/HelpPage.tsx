// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 31/10/2026
import type { ReactNode } from 'react';
import { Link } from 'react-router';

type HelpSection = {
  id: string;
  title: string;
  steps: ReactNode[];
  note?: string;
};

// Página de ayuda (TR-08, #89). Una sección por flujo ya entregado en develop;
// se amplía en cada sprint antes de la demo (Definition of Done).
const SECTIONS: HelpSection[] = [
  {
    id: 'crear-cuenta',
    title: 'Crear una cuenta',
    steps: [
      <>
        Pulsa «<Link to="/registro">Crear cuenta</Link>» en la cabecera.
      </>,
      'Escribe un nombre de usuario (de 3 a 30 caracteres: letras sin acentos, números, «.», «_» o «-»), tu correo electrónico y una contraseña de al menos 8 caracteres.',
      'Pulsa «Crear cuenta». Entrarás directamente con tu sesión iniciada.',
    ],
    note: 'Si un dato no es válido, verás el error debajo del campo. Con «Mostrar» puedes ver la contraseña que has escrito.',
  },
  {
    id: 'iniciar-sesion',
    title: 'Iniciar sesión',
    steps: [
      <>
        Pulsa «<Link to="/login">Iniciar sesión</Link>» en la cabecera.
      </>,
      'Escribe tu correo electrónico y tu contraseña.',
      'Pulsa «Iniciar sesión». Volverás a la página en la que estabas.',
    ],
    note: 'Si el correo o la contraseña no son correctos, verás el error debajo del campo.',
  },
  {
    id: 'ver-perfil',
    title: 'Ver tu perfil',
    steps: [
      <>
        Con la sesión iniciada, pulsa «<Link to="/perfil">Mi perfil</Link>» en la cabecera.
      </>,
      'Verás tu nombre de usuario, tu correo electrónico y desde cuándo eres miembro.',
    ],
    note: 'Si no has iniciado sesión, primero se te pedirá que lo hagas y después irás a tu perfil.',
  },
  {
    id: 'cerrar-sesion',
    title: 'Cerrar sesión',
    steps: ['Pulsa «Cerrar sesión» en la cabecera.', 'Volverás a la pantalla de inicio de sesión.'],
    note: 'Después de cerrar sesión, nadie puede volver a entrar en tu cuenta desde ese navegador sin tu contraseña.',
  },
];

export function HelpPage() {
  return (
    <section className="help">
      <h1>Ayuda</h1>
      <p className="help-intro">Cómo usar Rentit, paso a paso.</p>

      <nav aria-label="En esta página" className="help-index">
        <h2>En esta página</h2>
        <ul>
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.title}</a>
            </li>
          ))}
        </ul>
      </nav>

      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-titulo`}>
          <h2 id={`${section.id}-titulo`}>{section.title}</h2>
          <ol>
            {section.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          {section.note && <p className="help-note">{section.note}</p>}
        </section>
      ))}
    </section>
  );
}
