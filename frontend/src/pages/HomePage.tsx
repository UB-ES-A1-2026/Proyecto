import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../context/useAuth';
import { Icon, type IconName } from '../components/Icon';
import { categoryIcon } from '../utils/categoryIcons';
import { ItemCard, ItemGridSkeleton } from '../components/ItemCard';
import { RiderStatusCard } from '../components/RiderStatusCard';
import { SearchBar } from '../components/SearchBar';
import { getCategories, type Category } from '../services/categoryService';
import { searchItems, type SearchItem } from '../services/searchService';
import { RIDER_JOBS_PATH, isApprovedRider, isRiderSession } from '../utils/rider';

const NEWEST_ITEMS_COUNT = 8;
const MAX_CATEGORIES = 12;

const HERO_ICONS: IconName[] = [
  'build',
  'directions_bike',
  'celebration',
  'photo_camera',
  'yard',
  'devices',
];

const STEPS: { title: string; text: string }[] = [
  {
    title: 'Busca cerca de ti',
    text: 'Encuentra lo que necesitas entre los objetos que publican tus vecinos.',
  },
  {
    title: 'Elige las fechas',
    text: 'Comprueba que está libre esos días y envía tu solicitud de alquiler.',
  },
  {
    title: 'Recógelo y úsalo',
    text: 'Cuando el propietario acepte, el objeto es tuyo durante esos días.',
  },
];

// Portada: buscador, categorías, últimos objetos publicados y cómo funciona. Si la API falla, la
// portada se sigue viendo: las categorías no salen y las novedades muestran un aviso discreto.
function PublicHome() {
  const { session } = useAuth();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [itemsError, setItemsError] = useState(false);

  useEffect(() => {
    let ignore = false;
    getCategories()
      .then((data) => {
        if (!ignore) setCategories(data.slice(0, MAX_CATEGORIES));
      })
      .catch(() => {
        if (!ignore) setCategories([]);
      });
    // Sin texto, la API devuelve los objetos publicados, del más reciente al más antiguo.
    searchItems({})
      .then((data) => {
        if (!ignore) setItems(data.items.slice(0, NEWEST_ITEMS_COUNT));
      })
      .catch(() => {
        if (!ignore) setItemsError(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="home">
      <section className="home-hero">
        <div>
          {session ? (
            <h1 className="home-hero-title">Hola, {session.user.username}</h1>
          ) : (
            <>
              <h1 className="home-hero-brand">Rentit</h1>
              <p className="home-hero-title">Lo que necesitas, a la vuelta de la esquina</p>
            </>
          )}
          <p className="home-hero-tagline">Alquila objetos a tus vecinos.</p>
          <SearchBar />
          <div className="home-hero-actions">
            {session ? (
              <Link to="/objetos/nuevo" className="button-secondary">
                Publicar un objeto
              </Link>
            ) : (
              <>
                <Link to="/login" className="button-secondary home-hero-ghost">
                  Iniciar sesión
                </Link>
                <Link to="/registro" className="button-secondary">
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="home-hero-art" aria-hidden="true">
          {HERO_ICONS.map((icon) => (
            <span className="home-hero-tile" key={icon}>
              <Icon name={icon} />
            </span>
          ))}
        </div>
      </section>

      {categories === null ? (
        <section className="home-section" aria-hidden="true">
          <div className="home-categories">
            {Array.from({ length: 8 }, (_, index) => (
              <div className="skeleton home-category-skeleton" key={index} />
            ))}
          </div>
        </section>
      ) : (
        categories.length > 0 && (
          <section className="home-section" aria-labelledby="home-categorias">
            <h2 id="home-categorias" className="home-section-title">
              Explora por categoría
            </h2>
            <ul className="home-categories stagger">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    to={`/buscar?categoryId=${encodeURIComponent(category.id)}`}
                    className="card card-hover home-category"
                  >
                    <span className="home-category-icon">
                      <Icon name={categoryIcon(category.name)} />
                    </span>
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      )}

      <section className="home-section" aria-labelledby="home-novedades">
        <div className="home-section-header">
          <h2 id="home-novedades" className="home-section-title">
            Novedades
          </h2>
          <Link to="/buscar?q=" className="home-section-link">
            Ver todos los objetos
            <Icon name="arrow_forward" size="1.125rem" />
          </Link>
        </div>
        {itemsError ? (
          <p className="home-soft-error">
            <Icon name="info" />
            Ahora mismo no podemos mostrar las novedades.
          </p>
        ) : items === null ? (
          <ItemGridSkeleton count={NEWEST_ITEMS_COUNT} />
        ) : items.length === 0 ? (
          <div className="card empty-state">
            <Icon name="inventory_2" />
            <p>Todavía no hay objetos publicados.</p>
          </div>
        ) : (
          <ul className="item-grid stagger">
            {items.map((item) => (
              <ItemCard item={item} headingLevel="h3" key={item.id} />
            ))}
          </ul>
        )}
      </section>

      <section className="home-section" aria-labelledby="home-como-funciona">
        <h2 id="home-como-funciona" className="home-section-title">
          Cómo funciona
        </h2>
        <ol className="home-steps">
          {STEPS.map((step) => (
            <li className="home-step" key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// Un rider no ve la portada (US-10.03, T35 #315): el aceptado va a «Trabajos» y el pendiente o
// rechazado ve el estado de su solicitud.
export function HomePage() {
  const { session } = useAuth();
  if (session && isApprovedRider(session)) return <Navigate to={RIDER_JOBS_PATH} replace />;
  if (session && isRiderSession(session)) return <RiderStatusCard user={session.user} />;
  return <PublicHome />;
}
