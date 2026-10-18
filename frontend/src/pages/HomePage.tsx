import { useEffect, useState } from 'react';
import { getHealth } from '../services/healthService';

type ApiStatus = 'cargando' | 'ok' | 'error';

// Página provisional: la home de verdad es la tarea #7.
export function HomePage() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('cargando');

  useEffect(() => {
    getHealth()
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('error'));
  }, []);

  return (
    <section>
      <h1>Rentit</h1>
      <p>Alquila objetos a tus vecinos.</p>
      <p role="status">
        {apiStatus === 'cargando' && 'Comprobando la conexión con la API…'}
        {apiStatus === 'ok' && 'API conectada'}
        {apiStatus === 'error' && 'No se puede conectar con la API'}
      </p>
    </section>
  );
}
