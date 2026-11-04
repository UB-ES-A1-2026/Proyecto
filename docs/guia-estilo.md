# Guía de estilo de Rentit

Cómo se ve Rentit y cómo mantenerlo coherente al añadir pantallas (TR-09, #155).

> Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 03/11/2026. Paleta y logo de la maqueta de Figma de Francesc (#157) aplicados por Danyal, 03/11/2026 (#158).

**Maqueta:** [Rentit en Figma](https://www.figma.com/design/C6S1Lj9UBkEW0FxZP8chpV/Sin-t%C3%ADtulo?node-id=0-1) (home con búsqueda, ficha de objeto y login, #157).

## La norma

Toda la identidad está en el bloque `:root` de [`frontend/src/styles.css`](../frontend/src/styles.css). **Fuera de ese bloque no se escriben colores a mano**: siempre `var(--color-…)`. Un test lo comprueba (`frontend/tests/contrast.test.ts`), junto con el contraste de la paleta.

## Logo y favicon

- Son el mismo archivo: [`frontend/public/favicon.svg`](../frontend/public/favicon.svg), la «R» verde (`#0f5c55`) sobre un cuadrado naranja redondeado (`#f2a33a`), igual que en la maqueta de Figma.
- En la cabecera va a 28 × 28 px, seguido del nombre «Rentit» en naranja. Es decorativo (`alt=""`) porque el nombre ya está escrito al lado.
- Un SVG no puede leer las variables CSS. Si cambian `--color-primary` o `--color-accent`, hay que cambiar también los colores del logo.

## Cabecera

Como en la maqueta: barra verde (`--color-primary`), logo y nombre en naranja (`--color-accent`) y enlaces en blanco (`--color-on-primary`). Se queda fija al hacer scroll. La página en la que estás se marca con el verde oscuro (`--color-primary-hover`). Por debajo de 960 px los enlaces se recogen en un menú con el botón «Abrir menú».

## Colores

Los de la maqueta de Figma: verde y naranja, con texto verde muy oscuro y fondos beige.

| Variable | Valor | Para qué |
|---|---|---|
| `--color-primary` | `#0f5c55` | Cabecera, enlaces, botones secundarios y elementos activos |
| `--color-primary-hover` | `#0b4741` | Verde al pasar el ratón y enlace activo de la cabecera |
| `--color-primary-soft` | `#dcebe8` | Fondo del elemento activo o seleccionado y etiquetas |
| `--color-on-primary` | `#ffffff` | Texto sobre el verde |
| `--color-accent` | `#f2a33a` | Botón principal («Publicar», «Alquilar», «Iniciar sesión»…), logo y nombre de la cabecera |
| `--color-accent-hover` | `#e08d1f` | Botón principal al pasar el ratón |
| `--color-accent-soft` | `#fdf0dc` | Degradado suave en los huecos de los objetos sin foto |
| `--color-on-accent` | `#14302c` | Texto sobre el naranja: siempre oscuro, nunca blanco |
| `--color-text` | `#14302c` | Texto normal |
| `--color-text-muted` | `#4d6560` | Texto secundario y ayudas de los campos |
| `--color-page` | `#faf8f3` | Fondo de la página |
| `--color-background` | `#ffffff` | Fondo de tarjetas, ventanas y campos |
| `--color-surface` | `#f5f1e6` | Fondo de zonas destacadas (beige de la maqueta) |
| `--color-border` | `#7c9a93` | Bordes de campos |
| `--color-border-soft` | `#d9d6cc` | Bordes de tarjetas |
| `--color-divider` | `#e9e5dc` | Líneas de separación |
| `--color-error` | `#b42318` | Texto y borde de error, acciones destructivas |
| `--color-error-background` | `#fef3f2` | Fondo de los mensajes de error |
| `--color-error-hover` | `#912018` | Acción destructiva al pasar el ratón |
| `--color-success` | `#15803d` | Texto de éxito |
| `--color-success-background` | `#f0fdf4` | Fondo de los mensajes de éxito |
| `--color-warning` | `#8a4b08` | Texto de aviso |
| `--color-warning-soft` | `#feead1` | Fondo de los avisos |
| `--color-focus` | `#0f5c55` | Anillo de foco sobre fondos claros |
| `--color-focus-on-dark` | `#f2a33a` | Anillo de foco sobre el verde |
| `--color-overlay` | `rgb(0 0 0 / 0.45)` | Fondo oscuro detrás de una ventana |

**Cómo se reparte el color:** naranja solo para la acción principal de cada pantalla; verde para las secundarias, los enlaces y los estados; fondo beige claro y tarjetas blancas.

## Tipografía

La fuente es **Inter** (`--font-family`), con todos sus pesos en un solo archivo. Está en el repositorio ([`frontend/src/assets/fonts/`](../frontend/src/assets/fonts/)), así que no depende de ningún servicio externo. Si no carga, se usa la del sistema. Licencia: SIL Open Font License 1.1.

| Variable | Valor | Para qué |
|---|---|---|
| `--font-size-small` | `0.875rem` | Ayudas y errores de los campos |
| `--font-size-logo` | `1.25rem` | Nombre en la cabecera |
| `--font-size-tagline` | `1.125rem` | Frase de la página inicial e importes |
| `--font-size-section` | `1.375rem` | Título de una sección |
| `--font-size-title` | `2.25rem` | Título de la página |
| `--font-size-display` | de `2.25rem` a `3.5rem` | Titular de la página inicial |
| `--font-weight-medium` | `600` | Etiquetas y botones |
| `--font-weight-bold` | `700` | Títulos e importes |

Espaciados (`--space-xs` a `--space-3xl`), radios (`--radius`, `--radius-large`, `--radius-pill`), sombras (`--shadow-sm`, `--shadow-md`, `--shadow-lg`) y anchos máximos también son variables de ese bloque.

## Iconos

Son [Material Symbols Rounded](https://fonts.google.com/icons) de Google (licencia Apache 2.0), en SVG dentro de [`frontend/src/assets/icons/`](../frontend/src/assets/icons/). Se usan con el componente `Icon`, que toma el color del texto y es decorativo: el nombre accesible lo pone el texto del botón o del enlace.

```tsx
<Icon name="search" size="1.25rem" />
```

Para añadir uno, copia su SVG a esa carpeta y añade su nombre a `IconName`, en `components/Icon.tsx`.

## Movimiento

Las animaciones son cortas y sutiles, siempre con estas variables: `--duration-fast` (150 ms), `--duration` (240 ms), `--duration-slow` (420 ms) y `--ease-out`. Con `prefers-reduced-motion` activado se desactivan todas.

## Hojas de estilo

`styles.css` tiene la identidad y las piezas comunes. Lo propio de cada zona va en `styles/discover.css` (inicio, búsqueda, ayuda), `styles/item.css` (ficha y alquiler), `styles/account.css` (cuenta, perfil, publicar) y `styles/manage.css` (mis objetos, ventanas, solicitudes). Las clases de zona van con ámbito (`.item-detail .item-info`), porque todas las hojas se cargan a la vez y una clase con el mismo nombre en otra zona se pisaría.

## Componentes comunes

### Botones

| Clase | Cuándo |
|---|---|
| `button-primary` | La acción principal de la pantalla, en naranja con texto oscuro. Solo uno por formulario |
| `button-secondary` | Acciones secundarias, como «Cancelar» o «Volver», con borde verde |
| `button-quiet` | Acción discreta, sin borde |
| `button-link` | Acción de la cabecera con aspecto de enlace, como «Cerrar sesión» |
| `link-button` | Botón con aspecto de enlace dentro del contenido, como «Limpiar filtros» |
| `button-danger` | Confirmar una acción destructiva, como retirar un anuncio |

Mientras se envía, el botón se desactiva y cambia de texto: «Guardando…», «Publicando…».

### Tarjetas, etiquetas y estados

- **Tarjeta:** `card`, y `card-hover` si toda la tarjeta se puede pulsar.
- **Etiqueta de estado:** `badge` con `badge-success`, `badge-warning`, `badge-neutral` o `badge-error`.
- **Sin contenido:** `empty-state`, con un icono y una frase.
- **Listas que entran escalonadas:** `stagger`.

### Campo de formulario

```html
<div class="form-field">
  <label for="item-title">Nombre</label>
  <input id="item-title" aria-invalid="true" aria-describedby="item-title-error" />
  <p id="item-title-error" class="field-error">El campo "nombre" no es correcto, revísalo.</p>
</div>
```

- Toda etiqueta está unida a su campo con `for` e `id`.
- Las ayudas van en `field-hint`.
- Con error: `aria-invalid`, borde rojo y el mensaje en `field-error`, unido con `aria-describedby`.

### Mensajes

- **Error de un campo:** `field-error`, debajo del campo: `El campo "X" no es correcto, revísalo.`
- **Error general:** `form-error` con `role="alert"`, encima del formulario.
- **Carga:** bloques `skeleton` con la forma del contenido y, para lectores de pantalla, un texto como «Cargando el objeto…».

## Contraste

Todo el texto normal cumple **WCAG AA**, al menos 4,5:1. Si cambias un color, `npm test` en `frontend/` avisa de si deja de cumplirlo.

| Texto sobre fondo | Contraste |
|---|---|
| `--color-text` sobre `--color-background` | 14,10:1 |
| `--color-text-muted` sobre `--color-surface` | 5,56:1 |
| `--color-primary` sobre `--color-background` | 7,83:1 |
| `--color-primary` sobre `--color-primary-soft` | 6,37:1 |
| `--color-on-primary` sobre `--color-primary` | 7,83:1 |
| `--color-on-accent` sobre `--color-accent` | 6,77:1 |
| `--color-on-accent` sobre `--color-accent-hover` | 5,37:1 |
| `--color-error` sobre `--color-background` | 6,57:1 |
| `--color-error` sobre `--color-error-background` | 6,05:1 |
| `--color-success` sobre `--color-success-background` | 4,79:1 |
| `--color-warning` sobre `--color-warning-soft` | 5,79:1 |
| `--color-accent` sobre `--color-primary` (solo el nombre de la cabecera, texto grande: mínimo 3:1) | 3,76:1 |

El naranja nunca lleva texto blanco encima (no llega a 4,5:1): siempre `--color-on-accent`.
