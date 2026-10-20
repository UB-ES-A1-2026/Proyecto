# Testing en Rentit

Estrategia de pruebas, convenciones de los tests end-to-end y casos de prueba de aceptación de las user stories.

- **Tareas:** T19 (#99), T21 (#101), T22 (#102), T25 (#105)
- **Responsable:** Francesc (QA, Sprint 0)
- **Relacionado:** [README · Tests](../README.md#tests) (cómo ejecutarlos), [CONTRIBUTING.md](../CONTRIBUTING.md) (Definition of Done)

> Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 20/10/2026.

## 1. Estrategia

Probamos en tres niveles. Cuanto más abajo, más tests, más rápidos y más concretos; cuanto más arriba, menos tests pero más cercanos a lo que hace el usuario.

| Nivel | Herramienta | Dónde | Qué comprueba | Quién lo escribe |
|---|---|---|---|---|
| Unitarios y de API (backend) | Vitest + Supertest | `backend/tests/` | Services y endpoints, contra la BD `rentit_test` | BE, junto con el código |
| Unitarios (frontend) | Vitest + Testing Library | `frontend/tests/` | Páginas, componentes y servicios, con la API simulada | FE, junto con el código |
| End-to-end | Playwright | `e2e/tests/` | La aplicación completa en un navegador real, siguiendo los criterios de aceptación | QA |
| Smoke | Playwright (tag `@smoke`) | `e2e/tests/smoke.spec.ts` | Que la aplicación arranca y el flujo básico (registro + login) funciona | QA |

Reglas generales (de [AGENTS.md](../AGENTS.md)):

- Cada función de service, endpoint o componente nuevo tiene **al menos un test**.
- Cada bug arreglado tiene un test que lo reproduce.
- Si un test falla, se arregla el código, no el test, salvo que el comportamiento haya cambiado a propósito.
- Cada criterio de aceptación de una user story tiene **un caso de prueba** (sección 4) y, si es posible, **un test e2e** que lo automatiza.

## 2. Cómo se ejecutan

Los comandos completos están en el [README](../README.md#tests). Resumen:

| Tests | Desde | Comando | Necesita en marcha |
|---|---|---|---|
| Backend | `backend/` | `npm test` | PostgreSQL |
| Frontend | `frontend/` | `npm test` | Nada |
| End-to-end | `e2e/` | `npx playwright test` | PostgreSQL con el seed, backend y frontend |
| Smoke | `e2e/` | `npm run test:smoke` | PostgreSQL con el seed, backend y frontend |

`npm run test:smoke` ejecuta solo los tests marcados con `@smoke`, en Chromium. Es el que se ejecuta en el CI.

## 3. Tests end-to-end: convenciones

### Organización

- Un archivo por user story en `e2e/tests/`: `registro.spec.ts`, `login.spec.ts`, `logout.spec.ts`.
- En la cabecera del archivo, la user story y su issue: `US-01.1 Registro (issue #45)`.
- **Un test por criterio de aceptación**, con un comentario `// Criterio N` encima. Si un criterio tiene varios casos (por ejemplo, distintos errores), se separan en `3a`, `3b`…
- Títulos de los tests en español y describiendo el comportamiento esperado: `'con datos válidos se crea la cuenta y se accede a la página inicial'`.

### Cómo encontrar elementos

- Buscar los elementos como los ve el usuario, no por clases CSS:
  - Campos: `page.getByLabel('Correo electrónico')`.
  - Botones y enlaces: `page.getByRole('button', { name: 'Crear cuenta' })`.
- `getByLabel('Contraseña', { exact: true })`: sin `exact`, también encuentra el botón «Mostrar contraseña».
- Si hay dos elementos con el mismo nombre (en la home hay dos enlaces «Iniciar sesión»), acotar la búsqueda: `page.getByRole('navigation', { name: 'Principal' }).getByRole('link', …)`.

### Qué comprobar

- **El resultado, no solo la URL.** Tras un login, además de la URL, comprobar que aparece «Cerrar sesión».
- **El error en el campo correcto.** Comprobar el texto del error y que el campo tiene `aria-invalid="true"`, no solo que hay algún error en la página.
- **Que la comprobación puede fallar.** Si un test no puede fallar nunca, no prueba nada. Ejemplo: para comprobar que el token deja de valer tras el logout, primero se comprueba que funciona (200) y después que ya no (401).

### Datos de prueba

- Para iniciar sesión se usan los usuarios del seed (`ana@rentit.test` / `Rentit2026`), así que antes hay que ejecutar `npm run db:seed` en `backend/`.
- Lo que crea un test (por ejemplo, un usuario nuevo) lleva datos únicos en cada ejecución (`uniqueUser()`), para que se pueda repetir y ejecutar en paralelo.
- Ningún test depende de que otro se haya ejecutado antes.

### Cuando un test falla

1. `npx playwright show-report`: muestra el paso que ha fallado, el error y una captura.
2. `npx playwright test --ui`: permite ejecutar el test paso a paso y ver la página en cada momento.
3. Comprobar a mano en el navegador si el fallo es de la aplicación o del test.

El primer test justo después de arrancar el frontend con `npm run dev` puede tardar más de lo normal (Vite prepara las páginas la primera vez). Si falla solo esa vez por tiempo, vuelve a ejecutarlo.

## 4. Casos de prueba de aceptación

Cada caso corresponde a un criterio de aceptación del backlog. La columna **Test e2e** indica el test de Playwright que lo automatiza; el caso también se puede seguir a mano en la demo.

**Datos comunes:** BD con el seed cargado (`npm run db:seed`). Usuario existente: `ana@rentit.test` / `Rentit2026`.

### US-01.1 Registro (#45) · T21 (#101)

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-REG-01 | 1. Se muestran los campos del formulario | Sin sesión iniciada | 1. Ir a `/registro` | Se ven los campos «Nombre de usuario», «Correo electrónico» y «Contraseña» y el botón «Crear cuenta» | `registro.spec.ts` · criterio 1 |
| CP-REG-02 | 2. Registro con datos válidos | Sin sesión iniciada; el correo no está registrado | 1. Ir a `/registro` 2. Escribir un nombre de usuario nuevo (p. ej. `usuario_nuevo`), un correo nuevo y la contraseña `Rentit2026` 3. Pulsar «Crear cuenta» | Se crea la cuenta, se muestra la página inicial con «Hola, <usuario>» y la cabecera muestra «Mi perfil» y «Cerrar sesión» | `registro.spec.ts` · criterio 2 |
| CP-REG-03 | 3. Falta un dato obligatorio | Sin sesión iniciada | 1. Ir a `/registro` 2. Escribir solo el nombre de usuario 3. Pulsar «Crear cuenta» | No se crea la cuenta; se sigue en `/registro` y bajo el correo y la contraseña aparece «El campo "…" no está correctamente introducido, prueba a revisarlo.» | `registro.spec.ts` · criterio 3a |
| CP-REG-04 | 3. Correo ya registrado | Sin sesión iniciada | 1. Ir a `/registro` 2. Escribir un nombre de usuario nuevo, el correo `ana@rentit.test` y la contraseña `Rentit2026` 3. Pulsar «Crear cuenta» | No se crea la cuenta; se sigue en `/registro` y bajo el correo aparece el mensaje de error | `registro.spec.ts` · criterio 3b |
| CP-REG-05 | 4. Mostrar / ocultar contraseña | Sin sesión iniciada | 1. Ir a `/registro` 2. Escribir una contraseña 3. Pulsar «Mostrar» 4. Pulsar «Ocultar» | En el paso 2 la contraseña se ve oculta; en el 3 se ve el texto; en el 4 vuelve a ocultarse | `registro.spec.ts` · criterio 4 |

### US-01.2 Inicio de sesión (#46) · T22 (#102)

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-LOG-01 | 1. Se muestran los campos del formulario | Sin sesión iniciada | 1. Ir a `/login` | Se ven los campos «Correo electrónico» y «Contraseña» y el botón «Iniciar sesión» | `login.spec.ts` · criterio 1 |
| CP-LOG-02 | 2. Vuelve a la página en la que estaba (página privada) | Sin sesión iniciada | 1. Ir a `/perfil` (redirige a `/login`) 2. Iniciar sesión con `ana@rentit.test` / `Rentit2026` | Se vuelve a `/perfil` con la sesión iniciada | `login.spec.ts` · criterio 2 (página privada) |
| CP-LOG-03 | 2. Vuelve a la página en la que estaba (inicio) | Sin sesión iniciada | 1. Ir a `/` 2. Pulsar «Iniciar sesión» en la cabecera 3. Iniciar sesión con `ana@rentit.test` / `Rentit2026` | Se vuelve a `/` con «Hola, ana» y la cabecera muestra «Cerrar sesión» | `login.spec.ts` · criterio 2 (página inicial) |
| CP-LOG-04 | 3. Contraseña incorrecta | Sin sesión iniciada | 1. Ir a `/login` 2. Escribir `ana@rentit.test` y una contraseña incorrecta 3. Pulsar «Iniciar sesión» | No se inicia sesión; bajo la contraseña aparece «El campo "contraseña" no es correcto, revísalo.» | `login.spec.ts` · criterio 3a |
| CP-LOG-05 | 3. Correo que no existe | Sin sesión iniciada | 1. Ir a `/login` 2. Escribir `noexiste@rentit.test` y cualquier contraseña 3. Pulsar «Iniciar sesión» | No se inicia sesión; bajo el correo aparece «El campo "correo electrónico" no es correcto, revísalo.» | `login.spec.ts` · criterio 3b |
| CP-LOG-06 | 3. Campos vacíos | Sin sesión iniciada | 1. Ir a `/login` 2. Pulsar «Iniciar sesión» sin escribir nada | No se inicia sesión; aparecen los errores del correo y de la contraseña | `login.spec.ts` · criterio 3c |
| CP-LOG-07 | 4. Mostrar / ocultar contraseña | Sin sesión iniciada | 1. Ir a `/login` 2. Escribir una contraseña 3. Pulsar «Mostrar» 4. Pulsar «Ocultar» | En el paso 2 la contraseña se ve oculta; en el 3 se ve el texto; en el 4 vuelve a ocultarse | `login.spec.ts` · criterio 4 |

### US-01.3 Cerrar sesión (#47) · T25 (#105)

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-OUT-01 | 1. Hay un botón «Cerrar sesión» | Sesión iniciada como `ana@rentit.test` | 1. Mirar la cabecera | Se ve el botón «Cerrar sesión» | `logout.spec.ts` · criterio 1 |
| CP-OUT-02 | 2. Cerrar sesión redirige y deja de estar autenticado | Sesión iniciada | 1. Pulsar «Cerrar sesión» | Se va a `/login`; la cabecera muestra «Iniciar sesión» y «Crear cuenta» en lugar de «Mi perfil» y «Cerrar sesión» | `logout.spec.ts` · criterio 2 |
| CP-OUT-03 | 3. Las rutas privadas dejan de ser accesibles | Sesión iniciada | 1. Pulsar «Cerrar sesión» 2. Escribir en la barra de direcciones `/perfil` | Se redirige a `/login` | `logout.spec.ts` · criterio 3 |
| CP-OUT-04 | 4. El token anterior deja de ser válido | Sesión iniciada; token copiado (en DevTools › Application › Local Storage › `rentit.session`) | 1. Pulsar «Cerrar sesión» 2. Llamar a `GET /api/usuarios/me` con `Authorization: Bearer <token copiado>` | La API responde `401` | `logout.spec.ts` · criterio 4 |
| CP-OUT-05 | 5. El botón «atrás» no muestra contenido privado | Sesión iniciada | 1. Ir a «Mi perfil» 2. Ir a la página inicial 3. Pulsar «Cerrar sesión» 4. Pulsar «atrás» en el navegador | No se ve el perfil: se redirige a `/login` | `logout.spec.ts` · criterio 5 |

### Smoke test · T19 (#99)

| ID | Qué comprueba | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|
| CP-SMK-01 | La API está en marcha | `GET /api/health` | `200` con `{ "status": "ok" }` | `smoke.spec.ts` |
| CP-SMK-02 | La página inicial carga | Ir a `/` | Se ve el título «Rentit» y no hay errores de JavaScript | `smoke.spec.ts` |
| CP-SMK-03 | Flujo básico de registro y login | 1. Registrarse con un usuario nuevo 2. Cerrar sesión 3. Iniciar sesión con ese usuario | Tras el registro y tras el login se ve «Hola, <usuario>» | `smoke.spec.ts` |

## 5. Pendiente

- **Smoke test en el CI:** el workflow de GitHub Actions que arranca PostgreSQL, el backend y el frontend y ejecuta `npm run test:smoke`. Se coordina con el CI general (#19, Kai). En el CI conviene servir el frontend compilado (`npm run build` + `npm run preview`) en lugar de `npm run dev`, para evitar la espera de la primera carga de Vite.
- **E2E del perfil:** la página «Mi perfil» tiene tests unitarios pero aún no un test e2e propio (está cubierta indirectamente por el criterio 2 del login y el 5 del logout).
