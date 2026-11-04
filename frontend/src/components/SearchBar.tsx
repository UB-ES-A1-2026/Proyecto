import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from './Icon';

type SearchBarProps = {
  initialQuery?: string;
};

// Generado con asistencia de IA – revisado por Danyal, 31/10/2026
export function SearchBar({ initialQuery = '' }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const navigate = useNavigate();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    navigate(`/buscar?q=${encodeURIComponent(trimmedQuery)}`);
  }

  return (
    <form className="search-bar" role="search" onSubmit={handleSubmit}>
      <div className="search-field">
        <label htmlFor="object-search">¿Qué quieres alquilar?</label>
        <input
          id="object-search"
          type="search"
          name="q"
          maxLength={100}
          placeholder="Por ejemplo, taladro"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <button className="button-primary" type="submit">
        <Icon name="search" />
        Buscar
      </button>
    </form>
  );
}
