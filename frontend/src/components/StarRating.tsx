// Generado con asistencia de IA (Claude)
import { useId, useState, type Ref } from 'react';
import { Icon } from './Icon';

const SCORES = [1, 2, 3, 4, 5] as const;

const SCORE_LABELS: Record<number, string> = {
  1: 'Muy mal',
  2: 'Mal',
  3: 'Normal',
  4: 'Bien',
  5: 'Excelente',
};

type StarRatingProps = {
  value: number | null;
  onChange: (score: number) => void;
  error?: string | null;
  disabled?: boolean;
  // Primera estrella: para llevar el foco aquí cuando falta la puntuación.
  firstStarRef?: Ref<HTMLInputElement>;
};

// Puntuación de 1 a 5 estrellas (US-08.01, #296). Son botones de opción de verdad (se eligen con
// las flechas del teclado), con la estrella como dibujo; al pasar el ratón se ve cómo quedaría.
export function StarRating({
  value,
  onChange,
  error,
  disabled = false,
  firstStarRef,
}: StarRatingProps) {
  const id = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;
  const errorId = `${id}-error`;

  return (
    <fieldset
      className="star-rating"
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
    >
      <legend className="star-rating-legend">Puntuación</legend>
      <div className="star-rating-stars" onMouseLeave={() => setHovered(null)}>
        {SCORES.map((score) => (
          <label
            key={score}
            className={`star-rating-star${score <= shown ? ' is-on' : ''}`}
            onMouseEnter={() => setHovered(score)}
          >
            <input
              ref={score === 1 ? firstStarRef : undefined}
              type="radio"
              name={`${id}-score`}
              value={score}
              checked={value === score}
              onChange={() => onChange(score)}
              className="star-rating-input"
            />
            <Icon name={score <= shown ? 'star_fill' : 'star'} size="2rem" />
            <span className="star-rating-text">
              {score} {score === 1 ? 'estrella' : 'estrellas'}: {SCORE_LABELS[score]}
            </span>
          </label>
        ))}
        <span className="star-rating-value" aria-hidden="true">
          {shown > 0 ? SCORE_LABELS[shown] : 'Elige de 1 a 5'}
        </span>
      </div>
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

// Una valoración ya hecha, de solo lectura: «★★★★☆».
export function StarsDisplay({ score }: { score: number }) {
  return (
    <span className="stars-display" role="img" aria-label={`${score} de 5 estrellas`}>
      {SCORES.map((star) => (
        <Icon key={star} name={star <= score ? 'star_fill' : 'star'} size="1.125rem" />
      ))}
    </span>
  );
}
