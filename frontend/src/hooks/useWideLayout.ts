// Generado con asistencia de IA (Claude)
// Lista y detalle (decisión de Kai, 20/11): en pantallas anchas, la lista a la izquierda y el
// elemento elegido a la derecha. En el móvil y en pantallas estrechas, la lista de siempre.
import { useSyncExternalStore } from 'react';

export const WIDE_LAYOUT_QUERY = '(min-width: 1000px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const media = window.matchMedia(WIDE_LAYOUT_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function isWide(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(WIDE_LAYOUT_QUERY).matches;
}

export function useWideLayout(): boolean {
  return useSyncExternalStore(subscribe, isWide, () => false);
}
