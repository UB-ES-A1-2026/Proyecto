# Guía de estilo de Rentit

Cómo se ve Rentit y cómo mantenerlo coherente al añadir pantallas (TR-09, #155).

> Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 03/11/2026.

## La norma

Toda la identidad está en el bloque `:root` de [`frontend/src/styles.css`](../frontend/src/styles.css). **Fuera de ese bloque no se escriben colores a mano**: siempre `var(--color-…)`. Un test lo comprueba (`frontend/tests/contrast.test.ts`), junto con el contraste de la paleta.

## Logo y favicon

- Son el mismo archivo: [`frontend/public/favicon.svg`](../frontend/public/favicon.svg), una «R» blanca sobre un cuadrado azul (`#2563eb`).
- En la cabecera va a 28 × 28 px, seguido del nombre «Rentit». Es decorativo (`alt=""`) porque el nombre ya está escrito al lado.
- Un SVG no puede leer las variables CSS. Si cambia `--color-primary`, hay que cambiar también el color en el logo.

## Colores

| Variable | Valor | Para qué |
|---|---|---|
| `--color-primary` | `#2563eb` | Botón principal, enlaces y elementos activos |
| `--color-primary-hover` | `#1d4ed8` | Botón principal al pasar el ratón |
| `--color-primary-soft` | `#eff6ff` | Fondo del elemento activo o seleccionado |
| `--color-on-primary` | `#ffffff` | Texto sobre un fondo de color |
| `--color-text` | `#1f2937` | Texto normal |
| `--color-text-muted` | `#4b5563` | Texto secundario y ayudas de los campos |
| `--color-background` | `#ffffff` | Fondo de la página |
| `--color-surface` | `#f3f4f6` | Fondo de zonas destacadas |
| `--color-border` | `#d1d5db` | Bordes de campos y tarjetas |
| `--color-divider` | `#e5e7eb` | Líneas de separación |
| `--color-error` | `#d42020` | Texto y borde de error, acciones destructivas |
| `--color-error-background` | `#fef2f2` | Fondo de los mensajes de error |
| `--color-error-hover` | `#b91c1c` | Acción destructiva al pasar el ratón |
| `--color-success` | `#15803d` | Texto de éxito |
| `--color-success-background` | `#f0fdf4` | Fondo de los mensajes de éxito |
| `--color-warning` | `#92400e` | Texto de aviso |
| `--color-warning-soft` | `#fef3c7` | Fondo de los avisos |
| `--color-overlay` | `rgb(0 0 0 / 0.45)` | Fondo oscuro detrás de una ventana |

## Tipografía

Se usa la fuente del sistema (`--font-family`): carga al instante y no depende de ningún servicio externo.

| Variable | Valor | Para qué |
|---|---|---|
| `--font-size-small` | `0.875rem` | Ayudas y errores de los campos |
| `--font-size-logo` | `1.25rem` | Nombre en la cabecera |
| `--font-size-tagline` | `1.125rem` | Frase de la página inicial e importes |
| `--font-size-title` | `2.25rem` | Título de la página |
| `--font-weight-medium` | `600` | Etiquetas y botones |
| `--font-weight-bold` | `700` | Títulos e importes |

Espaciados (`--space-xs` a `--space-xl`), bordes y anchos máximos también son variables de ese bloque.

## Componentes comunes

### Botones

| Clase | Cuándo |
|---|---|
| `button-primary` | La acción principal de la pantalla. Solo uno por formulario |
| `button-secondary` | Acciones secundarias, como «Cancelar» o «Volver» |
| `button-link` | Acción con aspecto de enlace, como «Cerrar sesión» |
| `button-danger` | Confirmar una acción destructiva, como retirar un anuncio |

Mientras se envía, el botón se desactiva y cambia de texto: «Guardando…», «Publicando…».

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
- **Carga:** un texto como «Cargando el objeto…».

## Contraste

Todo el texto normal cumple **WCAG AA**, al menos 4,5:1. Si cambias un color, `npm test` en `frontend/` avisa de si deja de cumplirlo.

| Texto sobre fondo | Contraste |
|---|---|
| `--color-text` sobre `--color-background` | 14,68:1 |
| `--color-text-muted` sobre `--color-surface` | 6,87:1 |
| `--color-primary` sobre `--color-background` | 5,17:1 |
| `--color-primary` sobre `--color-primary-soft` | 4,75:1 |
| `--color-on-primary` sobre `--color-primary` | 5,17:1 |
| `--color-error` sobre `--color-background` | 5,21:1 |
| `--color-error` sobre `--color-error-background` | 4,77:1 |
| `--color-success` sobre `--color-success-background` | 4,79:1 |
| `--color-warning` sobre `--color-warning-soft` | 6,37:1 |
