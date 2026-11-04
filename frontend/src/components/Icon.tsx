import type { CSSProperties } from 'react';

// Iconos de Material Symbols Rounded (Google, licencia Apache 2.0), en src/assets/icons/.
// Para usar otro, descarga su SVG en esa carpeta y añádelo a IconName.
const ICON_URLS = import.meta.glob<string>('../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export type IconName =
  | 'add'
  | 'add_photo_alternate'
  | 'arrow_back'
  | 'arrow_forward'
  | 'badge'
  | 'bolt'
  | 'build'
  | 'calendar_month'
  | 'cancel'
  | 'category'
  | 'celebration'
  | 'check'
  | 'check_circle'
  | 'chevron_left'
  | 'chevron_right'
  | 'child_care'
  | 'close'
  | 'delete'
  | 'description'
  | 'devices'
  | 'directions_bike'
  | 'do_not_disturb_on'
  | 'edit'
  | 'error'
  | 'euro'
  | 'event'
  | 'favorite'
  | 'filter_alt'
  | 'groups'
  | 'handshake'
  | 'help'
  | 'home'
  | 'hourglass_empty'
  | 'hourglass_top'
  | 'image'
  | 'info'
  | 'inventory_2'
  | 'keyboard_arrow_down'
  | 'keyboard_arrow_up'
  | 'local_shipping'
  | 'location_on'
  | 'login'
  | 'logout'
  | 'mail'
  | 'menu'
  | 'more_horiz'
  | 'pause'
  | 'payments'
  | 'pedal_bike'
  | 'person'
  | 'person_add'
  | 'photo_camera'
  | 'pin_drop'
  | 'play_arrow'
  | 'price_check'
  | 'publish'
  | 'receipt_long'
  | 'schedule'
  | 'search'
  | 'search_off'
  | 'sell'
  | 'shield'
  | 'sports_soccer'
  | 'star'
  | 'storefront'
  | 'swap_horiz'
  | 'task_alt'
  | 'travel_explore'
  | 'tune'
  | 'verified_user'
  | 'visibility'
  | 'visibility_off'
  | 'warning'
  | 'yard';

type IconProps = {
  name: IconName;
  size?: string;
};

// Decorativo: el texto del botón o del enlace es lo que lee el lector de pantalla.
export function Icon({ name, size }: IconProps) {
  const style = {
    '--icon-url': `url("${ICON_URLS[`../assets/icons/${name}.svg`]}")`,
    ...(size && { '--icon-size': size }),
  } as CSSProperties;

  return <span className="icon" aria-hidden="true" style={style} />;
}
