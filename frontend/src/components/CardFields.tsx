// Generado con asistencia de IA (Claude)
import { useId } from 'react';
import {
  formatCardNumber,
  formatExpiry,
  TEST_CARDS,
  type CardDetails,
  type CardField,
} from '../services/cardGateway';
import { Icon } from './Icon';

type CardFieldsProps = {
  card: CardDetails;
  errors: Partial<Record<CardField, string>>;
  disabled: boolean;
  onChange: (field: CardField, value: string) => void;
};

// Campos de la tarjeta simulados (US-07.01, #286). Solo se usan sin VITE_STRIPE_PUBLISHABLE_KEY
// (local, CI y e2e); con la clave, el formulario es el Payment Element de Stripe (T10, #285).
export function CardFields({ card, errors, disabled, onChange }: CardFieldsProps) {
  const id = useId();
  const fields: {
    name: CardField;
    label: string;
    placeholder: string;
    autoComplete: string;
    format: (value: string) => string;
    maxLength: number;
  }[] = [
    {
      name: 'number',
      label: 'Número de tarjeta',
      placeholder: '1234 1234 1234 1234',
      autoComplete: 'cc-number',
      format: formatCardNumber,
      maxLength: 23,
    },
    {
      name: 'expiry',
      label: 'Caducidad',
      placeholder: 'MM/AA',
      autoComplete: 'cc-exp',
      format: formatExpiry,
      maxLength: 5,
    },
    {
      name: 'cvc',
      label: 'CVC',
      placeholder: '123',
      autoComplete: 'cc-csc',
      format: (value) => value.replace(/\D/g, '').slice(0, 4),
      maxLength: 4,
    },
  ];

  return (
    <>
      <div className="payment-card-fields">
        {fields.map((field) => {
          const inputId = `${id}-${field.name}`;
          const error = errors[field.name];
          return (
            <div key={field.name} className={`form-field payment-field-${field.name}`}>
              <label htmlFor={inputId}>{field.label}</label>
              <input
                id={inputId}
                name={field.name}
                inputMode="numeric"
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                value={card[field.name]}
                disabled={disabled}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
                onChange={(event) => onChange(field.name, field.format(event.target.value))}
              />
              {error && (
                <p id={`${inputId}-error`} className="field-error">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <TestCardsNote />
    </>
  );
}

// Nota de las tarjetas de prueba: se enseña con los campos simulados y con el formulario de Stripe.
export function TestCardsNote() {
  return (
    <div className="payment-test-cards">
      <p className="payment-test-cards-title">
        <Icon name="info" size="1.125rem" />
        Modo de prueba: no se mueve dinero real. Usa una de estas tarjetas, con cualquier fecha
        futura y cualquier CVC.
      </p>
      <ul>
        {TEST_CARDS.map((testCard) => (
          <li key={testCard.number}>
            <code>{testCard.number}</code> {testCard.result}
          </li>
        ))}
      </ul>
    </div>
  );
}
