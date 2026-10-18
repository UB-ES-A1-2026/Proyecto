import { Link } from 'react-router';
import { useAuth } from '../context/useAuth';

// Home del Sprint 0: la página a la que vuelve el usuario tras iniciar sesión (US-01.2).
// El buscador y los objetos cercanos llegan en el Sprint 1 (EP-03).
export function HomePage() {
  const { session } = useAuth();

  if (session) {
    return (
      <section className="home">
        <h1>Hola, {session.user.username}</h1>
        <p className="home-tagline">Alquila objetos a tus vecinos.</p>
      </section>
    );
  }

  return (
    <section className="home">
      <h1>Rentit</h1>
      <p className="home-tagline">Alquila objetos a tus vecinos.</p>
      <div className="home-actions">
        <Link to="/login" className="button-primary">
          Iniciar sesión
        </Link>
        <Link to="/registro" className="button-secondary">
          Crear cuenta
        </Link>
      </div>
    </section>
  );
}
