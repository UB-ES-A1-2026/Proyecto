// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 31/10/2026
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';

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
        Pulsa «<Link to="/registro">Crear cuenta</Link>» en el menú.
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
        Pulsa «<Link to="/login">Iniciar sesión</Link>» en el menú.
      </>,
      'Escribe tu correo electrónico y tu contraseña.',
      'Pulsa «Iniciar sesión». Volverás a la página en la que estabas o, si intentabas abrir una página que pide sesión (como «Mi perfil»), a esa página.',
    ],
    note: 'Si el correo o la contraseña no son correctos, verás el error debajo del campo.',
  },
  {
    id: 'ver-perfil',
    title: 'Ver y editar tu perfil',
    steps: [
      <>
        Con la sesión iniciada, pulsa «<Link to="/perfil">Mi perfil</Link>» en el menú. Es tu perfil
        público: lo mismo que ven los demás.
      </>,
      'Verás tu foto, tu nombre de usuario, desde cuándo eres miembro, tu valoración media, tu bio y los objetos que tienes publicados. Tu correo electrónico solo lo ves tú.',
      'Para cambiar la foto o la bio, pulsa «Editar perfil». Puedes subir una foto JPG, PNG o WebP de hasta 5 MB o quitarla, y escribir una bio de hasta 500 caracteres. Después, pulsa «Guardar».',
    ],
    note: 'Cualquiera puede ver tu perfil pulsando tu nombre en la ficha de uno de tus objetos. Si no has iniciado sesión, «Mi perfil» primero te pedirá que lo hagas.',
  },
  {
    id: 'cerrar-sesion',
    title: 'Cerrar sesión',
    steps: [
      'En «Mi perfil», pulsa «Cerrar sesión».',
      'Volverás a la pantalla de inicio de sesión.',
    ],
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
    id: 'filtrar',
    title: 'Filtrar los resultados',
    steps: [
      'En los resultados de la búsqueda, usa el panel de filtros. En el móvil, ábrelo con el botón «Filtros».',
      'Elige una categoría, un precio máximo por día, un barrio o varios a la vez.',
      'Pulsa «Aplicar filtros». Solo verás los objetos que cumplen todo, y cada filtro activo aparece sobre los resultados.',
      'Para quitar un filtro, pulsa su ✕. Para quitarlos todos, pulsa «Limpiar filtros» y volverás a los resultados de tu búsqueda.',
    ],
    note: 'El precio máximo tiene que ser mayor que 0. Si no es válido, verás el error debajo del campo y el filtro no se aplica.',
  },
  {
    id: 'ver-objeto',
    title: 'Ver la ficha de un objeto',
    steps: [
      'En los resultados de la búsqueda, pulsa el nombre del objeto.',
      'En su ficha verás las fotos, el precio por día, la fianza, si está disponible, la descripción, la categoría, el barrio, las formas de entrega y quién lo publica.',
      'Para pedirlo, usa el panel de alquiler de la ficha. Si no has iniciado sesión, pulsa «Alquilar»: primero se te pedirá que lo hagas y después volverás a la ficha.',
    ],
    note: 'De quien publica el objeto solo se ve su nombre de usuario. Si el objeto es tuyo, verás «Este anuncio es tuyo.» y no podrás alquilarlo.',
  },
  {
    id: 'solicitar',
    title: 'Solicitar un alquiler',
    steps: [
      'Con la sesión iniciada, abre la ficha del objeto.',
      'Elige la fecha de inicio y la fecha de fin en el panel de alquiler. Rentit comprueba si el objeto está libre esos días.',
      'Pulsa «Solicitar alquiler», revisa las fechas y el importe, y pulsa «Confirmar».',
      'Irás a «Mis solicitudes», donde verás tu solicitud como «Pendiente» hasta que responda el propietario.',
    ],
    note: 'Con «Volver» puedes cambiar las fechas antes de confirmar. No puedes alquilar un objeto que has publicado tú.',
  },
  {
    id: 'mis-solicitudes',
    title: 'Consultar tus solicitudes',
    steps: [
      <>
        Con la sesión iniciada, pulsa «<Link to="/mis-solicitudes">Mis solicitudes</Link>» en el
        menú.
      </>,
      'En «Enviadas» están las que has pedido tú, y en «Recibidas», las que te han pedido por tus objetos.',
      'Pulsa una solicitud para ver el detalle. Su estado puede ser «Pendiente», «Aceptada» o «Rechazada».',
    ],
  },
  {
    id: 'responder-solicitud',
    title: 'Aceptar o rechazar una solicitud',
    steps: [
      'En «Mis solicitudes», abre en «Recibidas» una solicitud «Pendiente».',
      'Revisa quién lo pide y las fechas.',
      'Pulsa «Aceptar» o «Rechazar». La solicitud cambia de estado y ya no se puede volver a responder.',
    ],
    note: 'Las fechas quedan ocupadas cuando aceptas. Si otra reserva ya ocupa esas fechas, no se podrá aceptar y verás un aviso.',
  },
  {
    id: 'publicar',
    title: 'Publicar un objeto',
    steps: [
      <>
        Con la sesión iniciada, en «Mis objetos», pulsa «
        <Link to="/objetos/nuevo">Publicar un objeto</Link>».
      </>,
      'Rellena el nombre, la descripción, la categoría, el precio por día, la fianza (déjala vacía si no pides) y el barrio.',
      'Si quieres, añade hasta 5 fotos JPG, PNG o WebP, de 5 MB como máximo.',
      'Elige si estará disponible ya o pausado, y las formas de entrega.',
      'Pulsa «Publicar». Irás a la ficha de tu objeto.',
    ],
    note: 'Si un dato no es válido, verás el error debajo del campo.',
  },
  {
    id: 'editar',
    title: 'Editar un objeto',
    steps: [
      <>
        Con la sesión iniciada, pulsa «<Link to="/mis-objetos">Mis objetos</Link>» en el menú.
      </>,
      'Pulsa «Editar» en el objeto que quieras cambiar.',
      'Cambia el nombre, la descripción, el precio o la fianza, o añade fotos.',
      'Pulsa «Guardar». Verás «Los cambios se han guardado.».',
    ],
    note: 'Por ahora las fotos se pueden añadir, hasta 5 en total, pero no borrar. La categoría, el barrio y las formas de entrega no se pueden cambiar.',
  },
  {
    id: 'pausar',
    title: 'Pausar o reanudar un objeto',
    steps: [
      'En «Mis objetos», pulsa «Pausar» en el objeto. Dejará de aparecer en las búsquedas.',
      'Cuando quieras que vuelva a aparecer, pulsa «Reanudar» en ese objeto.',
    ],
  },
  {
    id: 'retirar',
    title: 'Retirar un objeto',
    steps: [
      'En «Mis objetos», pulsa «Retirar anuncio» en el objeto.',
      'Confirma con «Retirar anuncio». Dejará de aparecer para los demás y nadie podrá solicitar su alquiler.',
    ],
    note: 'Un objeto con solicitudes pendientes o reservas activas no se puede retirar: antes hay que rechazar las pendientes. Retirar es definitivo: un objeto retirado ya no se puede editar. Si solo quieres dejarlo un tiempo, usa «Pausar». Con «Cancelar» no cambia nada.',
  },
];

export function HelpPage() {
  return (
    <section className="help">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ayuda</h1>
          <p className="page-subtitle">Cómo usar Rentit, paso a paso.</p>
        </div>
      </div>

      <div className="help-layout">
        <nav aria-label="En esta página" className="card help-index">
          <h2>En esta página</h2>
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="help-sections">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="card help-section"
              aria-labelledby={`${section.id}-titulo`}
            >
              <h2 id={`${section.id}-titulo`}>{section.title}</h2>
              <ol>
                {section.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              {section.note && (
                <p className="help-note">
                  <Icon name="info" />
                  <span>{section.note}</span>
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
