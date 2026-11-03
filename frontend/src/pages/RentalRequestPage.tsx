// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { RentalRequest, type RentalItem } from '../components/RentalRequest';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getRentalItem } from '../services/rentalService';

// Pantalla /objetos/:id/solicitar (US-04.01, #121): llega desde «Alquilar» en el detalle del
// objeto (#15). Es privada: sin sesión, PrivateRoute lleva al login y después vuelve aquí.
export function RentalRequestPage() {
  const { id = '' } = useParams();
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const navigate = useNavigate();
  const [item, setItem] = useState<RentalItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    getRentalItem(id, token)
      .then((detail) => {
        if (ignore) return;
        // Solo se pueden solicitar objetos publicados; el backend también lo comprueba (404).
        if (detail.status !== 'published') {
          setError('No hemos encontrado este objeto.');
          return;
        }
        setItem({
          id: detail.id,
          title: detail.title,
          pricePerDay: Number(detail.dailyPrice),
          photoUrl: detail.photos[0]?.url,
        });
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          clearSession();
        } else if (requestError instanceof ApiError) {
          setError(requestError.message);
        } else {
          setError('Ha ocurrido un error inesperado.');
        }
      });

    return () => {
      ignore = true;
    };
  }, [id, token, clearSession]);

  if (error) {
    return (
      <section className="rental-request">
        <h1>Solicitar alquiler</h1>
        <p role="alert" className="form-error">
          {error}
        </p>
        <Link to="/">Volver a la página inicial</Link>
      </section>
    );
  }

  if (!item) return <p>Cargando el objeto…</p>;

  return (
    <RentalRequest
      item={item}
      onCancel={() => navigate(`/objetos/${encodeURIComponent(id)}`)}
      onRequested={() => navigate('/mis-solicitudes')}
    />
  );
}
