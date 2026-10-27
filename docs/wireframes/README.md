# Wireframes

**Norma del equipo (#162), tras la corrección del profesor en la demo del Sprint 0:** antes de programar el frontend de una historia de usuario se hace un **wireframe** de sus pantallas, y el equipo lo ve antes de escribir componentes.

Un wireframe es un boceto de **baja fidelidad**: qué hay en cada pantalla, desde dónde llega el usuario, qué pasa al pulsar cada cosa y cuáles son los errores. No es el diseño final: nada de colores, logo ni tipografía de la marca (eso es la guía de estilo, #158).

> Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 22/10/2026.

![Ejemplo: wireframe de US-01.1 Registro](US-01.1-registro/flujo.png)

## Cuándo

- **Toda historia que crea o cambia una pantalla** lleva su wireframe. Las historias solo de backend, no.
- Se hace **al empezar la primera tarea de frontend de la historia**, antes de escribir ningún componente.
- Si al implementar cambia algo de la pantalla, se actualiza el wireframe en el mismo PR.

## Cómo (lo hace el agente de IA, lo revisa la persona)

Los wireframes son **HTML con unos estilos comunes** que se convierten en PNG con el Playwright que ya tenemos en `e2e/`. No hace falta Figma, ni cuentas, ni dependencias nuevas, y el agente de IA (Claude, Copilot…) los puede hacer y comprobar solo.

1. Copia la plantilla: `docs/wireframes/_plantilla/` → `docs/wireframes/US-XX.YY-<nombre>/` (por ejemplo, `US-02.01-publicar-objeto`).
2. Rellena `index.html`:
   - Cabecera con el código, el título y el «Como… quiero… para…» de la historia, y su número de issue.
   - Una `<section class="wf-pantalla" data-captura="<n>-<nombre>">` por cada **pantalla o estado** del flujo (vacío, con datos, con errores, cargando, confirmación…).
   - **La primera pantalla es el punto de entrada** (desde dónde llega el usuario y qué pulsa) y **la última, el destino** (a dónde va al terminar). Entre pantallas, un `<p class="wf-flecha">` con la acción que lleva a la siguiente.
   - **Textos reales**: los de los botones, etiquetas y errores, tal como dicen los criterios de aceptación. Relleno (`.wf-lineas`) solo donde el texto no importa.
   - **Notas numeradas** (`.wf-notas`) para lo que no se ve en el dibujo: validaciones, a dónde lleva cada botón, qué datos vienen de la API, qué ve cada rol. Cada `<span class="wf-marca">n</span>` de la pantalla se explica en la nota *n*.
   - Escritorio (`.wf-escritorio`) siempre; móvil (`.wf-movil`) al lado cuando la disposición cambia.
3. Genera los PNG (la primera vez en el ordenador, `npx playwright install chromium`):
   ```bash
   cd e2e
   npm run wireframes -- US-02.01-publicar-objeto
   ```
   Crea `flujo.png` (todo el flujo) y un PNG por pantalla. Sin argumentos regenera todas las carpetas.
   **Antes de generar, borra todos los `.png` de esa carpeta** para que no queden capturas de pantallas que ya no existen. Por eso, en la carpeta de un wireframe no guardes nada más: las capturas de la pantalla real van en el PR, no aquí.
4. **Revisa los PNG** (el agente los abre y comprueba que no hay nada cortado ni solapado).
5. Commit propio al principio de la tarea: `docs(wireframe): US-02.01 Publicar un objeto (#<nº tarea>)`.
6. **Enséñalo antes de programar**: comenta en el issue de la historia con el enlace a `flujo.png` en tu rama (el repo es público, la imagen se ve en GitHub) y avisa en el grupo. Si alguien ve un problema, se corrige ahora, que cuesta menos que cambiar los componentes.
7. En el PR de la tarea, pon `flujo.png` en la sección de capturas, al lado de la captura de la pantalla real.

## Piezas disponibles (`wireframe.css`)

| Clase | Qué es |
|---|---|
| `wf-escritorio` (con `data-url`) / `wf-movil` | Marco de navegador o de móvil. Dentro: `wf-nav` y `wf-contenido` |
| `wf-nav`, `wf-logo`, `wf-enlaces`, `wf-enlace` | Cabecera y navegación |
| `wf-h1`, `wf-texto`, `wf-lineas` | Título, texto y texto de relleno |
| `wf-campo` + `label` + `wf-input` (`wf-con-error`), `wf-ayuda`, `wf-error` | Campos de formulario |
| `wf-boton` (`wf-secundario`, `wf-desactivado`, `wf-ancho`) | Botones |
| `wf-tarjeta`, `wf-centrado`, `wf-fila`, `wf-rejilla` | Contenedores y disposición |
| `wf-imagen`, `wf-caja`, `wf-aviso` | Hueco de foto, zona sin detallar (mapa, lista…) y aviso o diálogo |
| `wf-marca`, `wf-notas`, `wf-flecha` | Anotaciones y paso entre pantallas |

Si hace falta una pieza nueva, se añade a `wireframe.css` (en su propio commit) en lugar de poner estilos sueltos en un wireframe, para que todos se parezcan.

## Ejemplo

[`US-01.1-registro/`](US-01.1-registro/): el registro del Sprint 0, dibujado después a partir de lo que se implementó, para que se vea el resultado. Va de la página inicial sin sesión (punto de entrada) al formulario, sus errores y la página inicial con la sesión iniciada (destino).
