// Generado con asistencia de IA (Claude)
import { useId, useState } from 'react';
import { useAdminData } from '../components/adminData';
import { Icon } from '../components/Icon';
import {
  SLOT_LABELS,
  VEHICLE_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
} from '../utils/riderLabels';

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// Riders activos: las solicitudes que un admin ha aceptado (US-11.03).
export function AdminActiveRidersPage() {
  const { applications, applicationsError } = useAdminData();
  const searchId = useId();
  const [text, setText] = useState('');

  const active = (applications ?? [])
    .filter((application) => application.status === 'approved')
    .sort((a, b) => a.user.username.localeCompare(b.user.username, 'es'));
  const needle = text.trim().toLocaleLowerCase('es');
  const visible = needle
    ? active.filter((rider) =>
        [rider.user.username, rider.user.email, rider.zone].some((value) =>
          value.toLocaleLowerCase('es').includes(needle),
        ),
      )
    : active;

  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Riders activos</h1>
          <p className="admin-page-subtitle">
            {applications
              ? `${active.length} ${active.length === 1 ? 'rider puede' : 'riders pueden'} aceptar entregas`
              : 'Cargando…'}
          </p>
        </div>
      </header>

      <div className="admin-table-card card">
        <div className="admin-toolbar">
          <div className="admin-search">
            <label htmlFor={searchId} className="manage-visually-hidden">
              Buscar riders
            </label>
            <Icon name="search" />
            <input
              id={searchId}
              type="search"
              placeholder="Buscar por nombre, correo o zona"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
        </div>

        {applicationsError ? (
          <p role="alert" className="form-error manage-notice admin-table-message">
            <Icon name="error" />
            {applicationsError}
          </p>
        ) : (
          <table className="admin-table">
            <caption className="manage-visually-hidden">Riders activos</caption>
            <thead>
              <tr>
                <th scope="col">Rider</th>
                <th scope="col">Zona</th>
                <th scope="col">Vehículo</th>
                <th scope="col">Disponibilidad</th>
                <th scope="col" className="admin-table-number">
                  Entregas
                </th>
                <th scope="col">Teléfono</th>
                <th scope="col">Activo desde</th>
              </tr>
            </thead>
            <tbody>
              {applications === null ? (
                [0, 1, 2].map((row) => (
                  <tr key={row} aria-hidden="true">
                    <td colSpan={7}>
                      <span className="skeleton admin-table-skeleton" />
                    </td>
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    {active.length === 0
                      ? 'Todavía no hay riders activos.'
                      : 'Ningún rider coincide con la búsqueda.'}
                  </td>
                </tr>
              ) : (
                visible.map((rider) => (
                  <tr key={rider.id}>
                    <td data-label="Rider">
                      <span className="admin-cell-person">
                        <span className="admin-row-avatar" aria-hidden="true">
                          {rider.user.username.charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <span className="admin-cell-title">{rider.user.username}</span>
                          <span className="admin-cell-meta">{rider.user.email}</span>
                        </span>
                      </span>
                    </td>
                    <td data-label="Zona">{rider.zone}</td>
                    <td data-label="Vehículo">{VEHICLE_LABELS[rider.vehicle]}</td>
                    <td data-label="Disponibilidad">
                      <span className="admin-days">
                        {WEEKDAY_ORDER.map((day) => (
                          <span
                            key={day}
                            className="admin-day"
                            data-on={rider.days.includes(day)}
                            title={WEEKDAY_LABELS[day]}
                          >
                            {WEEKDAY_SHORT[day]}
                          </span>
                        ))}
                      </span>
                      <span className="manage-visually-hidden">
                        {rider.days.map((day) => WEEKDAY_LABELS[day]).join(', ')}.
                      </span>
                      <span className="admin-cell-meta">
                        {rider.slots.map((slot) => SLOT_LABELS[slot]).join(', ')}
                      </span>
                    </td>
                    <td data-label="Entregas" className="admin-table-number">
                      {rider.deliveriesCount}
                    </td>
                    <td data-label="Teléfono">{rider.phone}</td>
                    <td data-label="Activo desde">
                      {rider.reviewedAt ? dateFormatter.format(new Date(rider.reviewedAt)) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
