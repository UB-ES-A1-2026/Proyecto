// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 03/11/2026
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest no procesa el CSS, así que se lee el archivo tal cual (se ejecuta desde frontend/).
const styles = readFileSync('src/styles.css', 'utf8');

// Contraste WCAG AA de la paleta (TR-09, #159): texto normal sobre su fondo, al menos 4,5:1.
const MIN_CONTRAST = 4.5;

function variable(name: string): string {
  const start = styles.indexOf(`--${name}:`);
  if (start < 0) throw new Error(`No existe la variable --${name}`);
  return styles.slice(start + name.length + 3, styles.indexOf(';', start)).trim();
}

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5]
    .map((position) => parseInt(hex.slice(position, position + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(variable(foreground)), luminance(variable(background))].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

describe('contraste de la paleta (WCAG AA)', () => {
  it.each([
    ['color-text', 'color-background'],
    ['color-text', 'color-surface'],
    ['color-text-muted', 'color-background'],
    ['color-text-muted', 'color-surface'],
    ['color-primary', 'color-background'],
    ['color-primary', 'color-primary-soft'],
    ['color-on-primary', 'color-primary'],
    ['color-on-primary', 'color-primary-hover'],
    ['color-error', 'color-background'],
    ['color-error', 'color-error-background'],
    ['color-on-primary', 'color-error'],
    ['color-on-primary', 'color-error-hover'],
    ['color-success', 'color-background'],
    ['color-success', 'color-success-background'],
    ['color-warning', 'color-background'],
    ['color-warning', 'color-warning-soft'],
    ['color-on-accent', 'color-accent'],
    ['color-on-accent', 'color-accent-hover'],
  ])('--%s sobre --%s', (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});

describe('los colores están en un solo sitio', () => {
  it('fuera del bloque :root no hay colores escritos a mano', () => {
    const outsideRoot = styles.slice(styles.indexOf('}', styles.indexOf(':root')) + 1);
    const withoutComments = outsideRoot.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(withoutComments.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi)).toBeNull();
  });
});

describe('nombre de la cabecera (texto grande, #158)', () => {
  // «Rentit» va en negrita a 1,25rem (20px): WCAG AA pide 3:1 para el texto grande.
  it('--color-accent sobre --color-primary', () => {
    expect(contrast('color-accent', 'color-primary')).toBeGreaterThanOrEqual(3);
  });
});
