import type { IconName } from '../components/Icon';

const CATEGORY_ICONS: Record<string, IconName> = {
  'Herramientas y bricolaje': 'build',
  Electrónica: 'devices',
  Deporte: 'directions_bike',
  'Camping y viajes': 'travel_explore',
  'Hogar y jardín': 'yard',
  'Fiestas y eventos': 'celebration',
  Infantil: 'child_care',
};

export function categoryIcon(categoryName: string): IconName {
  return CATEGORY_ICONS[categoryName] ?? 'category';
}
