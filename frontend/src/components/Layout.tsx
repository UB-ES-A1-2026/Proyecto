import { Link, Outlet } from 'react-router';
import { LogoutButton } from './LogoutButton';

// Layout mínimo del esqueleto; la navegación completa es la tarea #21.
export function Layout() {
  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-logo">
          Rentit
        </Link>
        <LogoutButton />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </>
  );
}
