import { Link } from 'react-router';
import type { SearchItem } from '../services/searchService';
import { categoryIcon } from '../utils/categoryIcons';
import { Icon } from './Icon';

const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

// El perfil público (US-01.4) lista objetos sin categoría: la tarjeta sirve para los dos.
type CardItem = Omit<SearchItem, 'category'> & { category?: SearchItem['category'] };

type ItemCardProps = {
  item: CardItem;
  headingLevel?: 'h2' | 'h3';
};

// Tarjeta de objeto del inicio y de la búsqueda. El enlace está en el título y se estira por CSS
// a toda la tarjeta, para que su nombre accesible siga siendo solo el título del objeto.
export function ItemCard({ item, headingLevel: Heading = 'h2' }: ItemCardProps) {
  return (
    <li className="search-result-card card card-hover item-card">
      <div className="item-card-media">
        {item.photo ? (
          <img src={item.photo} alt={item.title} loading="lazy" />
        ) : (
          <div className="item-card-no-photo" role="img" aria-label="Sin foto">
            <Icon name={item.category ? categoryIcon(item.category.name) : 'image'} size="3rem" />
          </div>
        )}
      </div>
      <div className="item-card-body">
        <Heading className="item-card-title">
          <Link to={`/objetos/${item.id}`} className="item-card-link">
            {item.title}
          </Link>
        </Heading>
        <p className="item-card-price">{priceFormatter.format(Number(item.dailyPrice))} / día</p>
        <p className="item-card-meta">
          <Icon name="location_on" size="1rem" />
          <span>
            {item.category ? `${item.neighborhood} · ${item.category.name}` : item.neighborhood}
          </span>
        </p>
      </div>
    </li>
  );
}

type ItemGridSkeletonProps = {
  count: number;
};

// Cuadrícula de tarjetas vacías mientras llegan los objetos.
export function ItemGridSkeleton({ count }: ItemGridSkeletonProps) {
  return (
    <ul className="item-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li className="card item-card" key={index}>
          <div className="skeleton item-card-media" />
          <div className="item-card-body">
            <div className="skeleton item-card-skeleton-line" />
            <div className="skeleton item-card-skeleton-line item-card-skeleton-short" />
          </div>
        </li>
      ))}
    </ul>
  );
}
