import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section>
      <h1>Página no encontrada</h1>
      <p>
        <Link to="/">Volver al inicio</Link>
      </p>
    </section>
  );
}
