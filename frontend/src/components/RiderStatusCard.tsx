// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Inicio de un rider pendiente o rechazado (US-10.03, T35 #315): en lugar de la portada ve el
// estado de su solicitud. Wireframe: pantallas 5 y 6 de docs/wireframes/US-10.03-hazte-rider.
import { Link } from 'react-router';
import type { AuthUser } from '../services/authService';
import { LogoutButton } from './LogoutButton';

export function RiderStatusCard({ user }: { user: AuthUser }) {
  const rejected = user.riderStatus === 'rejected';

  return (
    <section className="auth-card card rider-status">
      <h1>Tu solicitud para ser rider</h1>
      {rejected ? (
        <>
          <p>
            <span className="badge badge-error">Solicitud rechazada</span>
          </p>
          <p>Hola, {user.username}. Un admin ha rechazado tu solicitud para ser rider.</p>
          {/* El motivo llegará cuando la API lo mande (pedido a T34); sin motivo, no sale. */}
          {user.rejectionReason && <p className="form-error">Motivo: {user.rejectionReason}</p>}
          <p>
            <strong>Qué puedes hacer:</strong> si crees que es un error, escríbenos desde la{' '}
            <Link to="/ayuda">página de ayuda</Link>.
          </p>
        </>
      ) : (
        <>
          <p>
            <span className="badge badge-warning">Pendiente de revisión</span>
          </p>
          <p>Hola, {user.username}. Un admin está revisando tu solicitud.</p>
          <p>
            <strong>Qué pasará:</strong> cuando la acepte, al entrar irás directamente a «Trabajos»
            para elegir entregas. Si la rechaza, aquí verás el motivo.
          </p>
        </>
      )}
      <LogoutButton />
    </section>
  );
}
