// Generado con asistencia de IA (Claude)
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAdminData } from '../components/adminData';
import { Icon, type IconName } from '../components/Icon';
import { searchItems, type SearchResponse } from '../services/searchService';
import { VEHICLE_LABELS } from '../utils/riderLabels';

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' });
const shortDateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
});
const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const RECENT_COUNT = 5;

function Metric({
  to,
  icon,
  label,
  value,
  hint,
  highlight = false,
}: {
  to: string;
  icon: IconName;
  label: string;
  value: number | string | null;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <Link to={to} className="admin-metric card" data-highlight={highlight}>
      <span className="admin-metric-icon">
        <Icon name={icon} size="1.25rem" />
      </span>
      <span className="admin-metric-label">{label}</span>
      {value === null ? (
        <span className="skeleton admin-metric-skeleton" />
      ) : (
        <span className="admin-metric-value">{value}</span>
      )}
      <span className="admin-metric-hint">{hint}</span>
    </Link>
  );
}

// Resumen del panel de administración: cifras y lo último que necesita atención.
export function AdminDashboardPage() {
  const { applications } = useAdminData();
  const [items, setItems] = useState<SearchResponse | null>(null);
  const [itemsError, setItemsError] = useState(false);

  useEffect(() => {
    let ignore = false;
    // Sin texto, la búsqueda devuelve los objetos publicados, del más reciente al más antiguo.
    searchItems({})
      .then((data) => {
        if (!ignore) setItems(data);
      })
      .catch(() => {
        if (!ignore) setItemsError(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const pending = applications
    ? applications
        .filter((application) => application.status === 'pending')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : null;
  const activeRiders = applications
    ? applications.filter((application) => application.status === 'approved').length
    : null;

  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Resumen</h1>
          <p className="admin-page-subtitle">{dateFormatter.format(new Date())}</p>
        </div>
      </header>

      <div className="admin-metrics">
        <Metric
          to="/admin/objetos"
          icon="inventory_2"
          label="Objetos publicados"
          value={itemsError ? '—' : (items?.total ?? null)}
          hint={itemsError ? 'No se han podido contar' : 'Visibles en las búsquedas'}
        />
        <Metric
          to="/admin/riders"
          icon="group"
          label="Riders activos"
          value={activeRiders}
          hint="Pueden aceptar entregas"
        />
        <Metric
          to="/admin/solicitudes"
          icon="receipt_long"
          label="Solicitudes pendientes"
          value={pending ? pending.length : null}
          hint={pending && pending.length > 0 ? 'Esperan tu revisión' : 'Todo revisado'}
          highlight={Boolean(pending && pending.length > 0)}
        />
      </div>

      <div className="admin-panels">
        <section className="admin-panel card" aria-labelledby="admin-pendientes">
          <header className="admin-panel-header">
            <h2 id="admin-pendientes">Solicitudes por revisar</h2>
            <Link to="/admin/solicitudes" className="admin-panel-link">
              Ver todas
              <Icon name="arrow_forward" size="1rem" />
            </Link>
          </header>
          {pending === null ? (
            <div className="skeleton admin-panel-skeleton" />
          ) : pending.length === 0 ? (
            <p className="admin-panel-empty">No hay solicitudes pendientes.</p>
          ) : (
            <ul className="admin-rows">
              {pending.slice(0, RECENT_COUNT).map((application) => (
                <li key={application.id} className="admin-row">
                  <span className="admin-row-avatar" aria-hidden="true">
                    {application.user.username.charAt(0).toUpperCase()}
                  </span>
                  <span className="admin-row-main">
                    <span className="admin-row-title">{application.user.username}</span>
                    <span className="admin-row-meta">
                      {application.zone} · {VEHICLE_LABELS[application.vehicle]}
                    </span>
                  </span>
                  <span className="admin-row-side">
                    {shortDateFormatter.format(new Date(application.createdAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-panel card" aria-labelledby="admin-ultimos">
          <header className="admin-panel-header">
            <h2 id="admin-ultimos">Últimos objetos publicados</h2>
            <Link to="/admin/objetos" className="admin-panel-link">
              Ver todos
              <Icon name="arrow_forward" size="1rem" />
            </Link>
          </header>
          {itemsError ? (
            <p className="admin-panel-empty">No hemos podido cargar los objetos.</p>
          ) : items === null ? (
            <div className="skeleton admin-panel-skeleton" />
          ) : items.items.length === 0 ? (
            <p className="admin-panel-empty">Todavía no hay objetos publicados.</p>
          ) : (
            <ul className="admin-rows">
              {items.items.slice(0, RECENT_COUNT).map((item) => (
                <li key={item.id} className="admin-row">
                  <span className="admin-row-thumb" aria-hidden="true">
                    {item.photo ? <img src={item.photo} alt="" /> : <Icon name="image" />}
                  </span>
                  <span className="admin-row-main">
                    <Link to={`/objetos/${item.id}`} className="admin-row-title">
                      {item.title}
                    </Link>
                    <span className="admin-row-meta">
                      {item.category.name} · {item.neighborhood}
                    </span>
                  </span>
                  <span className="admin-row-side">
                    {priceFormatter.format(Number(item.dailyPrice))}/día
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
