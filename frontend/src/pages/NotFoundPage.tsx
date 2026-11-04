import { Link } from 'react-router';
import { Icon } from '../components/Icon';

export function NotFoundPage() {
  return (
    <section className="empty-state not-found">
      <Icon name="travel_explore" />
      <h1 className="page-title">Página no encontrada</h1>
      <p>Puede que el enlace esté mal escrito o que esta página ya no exista.</p>
      <Link to="/" className="button-primary">
        Volver al inicio
      </Link>
    </section>
  );
}
