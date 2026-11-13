import type { CSSProperties } from 'react';

// Iconos de Material Symbols Rounded (Google, licencia Apache 2.0), en src/assets/icons/.
// Para usar otro, descarga su SVG en esa carpeta y añádelo a IconName.
const ICON_URLS = import.meta.glob<string>('../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export type IconName =
  | 'add_photo_alternate'
  | 'arrow_forward'
  | 'build'
  | 'cancel'
  | 'category'
  | 'celebration'
  | 'check_circle'
  | 'chevron_left'
  | 'chevron_right'
  | 'child_care'
  | 'close'
  | 'dashboard'
  | 'delete'
  | 'description'
  | 'devices'
  | 'directions_bike'
  | 'do_not_disturb_on'
  | 'error'
  | 'event'
  | 'filter_alt'
  | 'group'
  | 'handshake'
  | 'help'
  | 'home'
  | 'hourglass_top'
  | 'image'
  | 'info'
  | 'inventory_2'
  | 'keyboard_arrow_down'
  | 'location_on'
  | 'login'
  | 'mail'
  | 'open_in_new'
  | 'pause'
  | 'payments'
  | 'pedal_bike'
  | 'person'
  | 'person_add'
  | 'photo_camera'
  | 'pin_drop'
  | 'receipt_long'
  | 'schedule'
  | 'search'
  | 'search_off'
  | 'shield'
  | 'swap_horiz'
  | 'task_alt'
  | 'travel_explore'
  | 'tune'
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
