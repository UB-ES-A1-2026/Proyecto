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
      'Pulsa «Iniciar sesión». Irás a la página de inicio o, si intentabas abrir una página que pide sesión (como «Mi perfil»), a esa página.',
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
  {
    id: 'buscar',
    title: 'Buscar un objeto',
    steps: [
      <>
        En la <Link to="/">página de inicio</Link>, escribe en «¿Qué quieres alquilar?» lo que
        necesitas, por ejemplo «taladro».
      </>,
      'Pulsa «Buscar». Verás los objetos disponibles cuyo nombre o descripción contienen ese texto, con su precio por día y su barrio.',
      'Pulsa el nombre de un objeto para abrir su ficha.',
    ],
    note: 'Si no hay ningún objeto con ese texto, verás un aviso. Los objetos que su propietario ha pausado o retirado no salen en la búsqueda.',
  },
  {
    id: 'ver-objeto',
    title: 'Ver la ficha de un objeto',
    steps: [
      'En los resultados de la búsqueda, pulsa el nombre del objeto.',
      'En su ficha verás las fotos, el precio por día, la fianza, si está disponible, la descripción, la categoría, el barrio, las formas de entrega y quién lo publica.',
      'Pulsa «Alquilar» para pedirlo. Si no has iniciado sesión, primero se te pedirá que lo hagas y después volverás a la ficha.',
    ],
    note: 'De quien publica el objeto solo se ve su nombre de usuario. Si el objeto es tuyo, verás «Este anuncio es tuyo.» en lugar del botón «Alquilar».',
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
