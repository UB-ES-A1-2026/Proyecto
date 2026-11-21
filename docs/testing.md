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
| Backend | `backend/` | `npm test` (con cobertura: `npm run test:coverage`) | PostgreSQL |
| Frontend | `frontend/` | `npm test` (con cobertura: `npm run test:coverage`) | Nada |
| End-to-end | `e2e/` | `npx playwright test` | PostgreSQL con el seed, backend y frontend |
| Smoke | `e2e/` | `npm run test:smoke` | PostgreSQL con el seed, backend y frontend |

`npm run test:smoke` ejecuta solo los tests marcados con `@smoke`, en Chromium. Sirve para comprobar rápido que todo arranca.

En el CI (#19, `.github/workflows/ci.yml`) se ejecutan **todos** los tests e2e, no solo el smoke: tardan menos de un minuto. Van contra una BD temporal del CI con el seed, el backend compilado y el build del frontend.

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

- **El resultado, no solo la URL.** Tras un login, además de la URL, comprobar que aparece «Mi perfil».
- **El error en el campo correcto.** Comprobar el texto del error y que el campo tiene `aria-invalid="true"`, no solo que hay algún error en la página.
- **Que la comprobación puede fallar.** Si un test no puede fallar nunca, no prueba nada. Ejemplo: para comprobar que el token deja de valer tras el logout, primero se comprueba que funciona (200) y después que ya no (401).

### Datos de prueba

- Para iniciar sesión se usan los usuarios del seed (`ana@rentit.test` / `Rentit2026`), así que antes hay que ejecutar `npm run db:seed` en `backend/`.
- Lo que crea un test (por ejemplo, un usuario nuevo) lleva datos únicos en cada ejecución (`uniqueUser()`), para que se pueda repetir sin chocar con datos de ejecuciones anteriores.
- Los tests se ejecutan **uno a uno** (`workers: 1` en `playwright.config.ts`). Van contra los servidores de desarrollo, y con varios navegadores a la vez la API tarda demasiado en responder y los tests fallan por timeout.
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
| CP-REG-02 | 2. Registro con datos válidos | Sin sesión iniciada; el correo no está registrado | 1. Ir a `/registro` 2. Escribir un nombre de usuario nuevo (p. ej. `usuario_nuevo`), un correo nuevo y la contraseña `Rentit2026` 3. Pulsar «Crear cuenta» | Se crea la cuenta, se muestra la página inicial con «Hola, <usuario>» y la cabecera muestra «Mi perfil» | `registro.spec.ts` · criterio 2 |
| CP-REG-03 | 3. Falta un dato obligatorio | Sin sesión iniciada | 1. Ir a `/registro` 2. Escribir solo el nombre de usuario 3. Pulsar «Crear cuenta» | No se crea la cuenta; se sigue en `/registro` y bajo el correo y la contraseña aparece «El campo "…" no está correctamente introducido, prueba a revisarlo.» | `registro.spec.ts` · criterio 3a |
| CP-REG-04 | 3. Correo ya registrado | Sin sesión iniciada | 1. Ir a `/registro` 2. Escribir un nombre de usuario nuevo, el correo `ana@rentit.test` y la contraseña `Rentit2026` 3. Pulsar «Crear cuenta» | No se crea la cuenta; se sigue en `/registro` y bajo el correo aparece el mensaje de error | `registro.spec.ts` · criterio 3b |
| CP-REG-05 | 4. Mostrar / ocultar contraseña | Sin sesión iniciada | 1. Ir a `/registro` 2. Escribir una contraseña 3. Pulsar «Mostrar» 4. Pulsar «Ocultar» | En el paso 2 la contraseña se ve oculta; en el 3 se ve el texto; en el 4 vuelve a ocultarse | `registro.spec.ts` · criterio 4 |

### US-01.2 Inicio de sesión (#46) · T22 (#102)

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-LOG-01 | 1. Se muestran los campos del formulario | Sin sesión iniciada | 1. Ir a `/login` | Se ven los campos «Correo electrónico» y «Contraseña» y el botón «Iniciar sesión» | `login.spec.ts` · criterio 1 |
| CP-LOG-02 | 2. Vuelve a la página en la que estaba (página privada) | Sin sesión iniciada | 1. Ir a `/perfil` (redirige a `/login`) 2. Iniciar sesión con `ana@rentit.test` / `Rentit2026` | Se vuelve a `/perfil` con la sesión iniciada | `login.spec.ts` · criterio 2 (página privada) |
| CP-LOG-03 | 2. Vuelve a la página en la que estaba (inicio) | Sin sesión iniciada | 1. Ir a `/` 2. Pulsar «Iniciar sesión» en la cabecera 3. Iniciar sesión con `ana@rentit.test` / `Rentit2026` | Se vuelve a `/` con «Hola, ana» y la cabecera muestra «Mi perfil» | `login.spec.ts` · criterio 2 (página inicial) |
| CP-LOG-04 | 3. Contraseña incorrecta | Sin sesión iniciada | 1. Ir a `/login` 2. Escribir `ana@rentit.test` y una contraseña incorrecta 3. Pulsar «Iniciar sesión» | No se inicia sesión; bajo la contraseña aparece «El campo "contraseña" no es correcto, revísalo.» | `login.spec.ts` · criterio 3a |
| CP-LOG-05 | 3. Correo que no existe | Sin sesión iniciada | 1. Ir a `/login` 2. Escribir `noexiste@rentit.test` y cualquier contraseña 3. Pulsar «Iniciar sesión» | No se inicia sesión; bajo el correo aparece «El campo "correo electrónico" no es correcto, revísalo.» | `login.spec.ts` · criterio 3b |
| CP-LOG-06 | 3. Campos vacíos | Sin sesión iniciada | 1. Ir a `/login` 2. Pulsar «Iniciar sesión» sin escribir nada | No se inicia sesión; aparecen los errores del correo y de la contraseña | `login.spec.ts` · criterio 3c |
| CP-LOG-07 | 4. Mostrar / ocultar contraseña | Sin sesión iniciada | 1. Ir a `/login` 2. Escribir una contraseña 3. Pulsar «Mostrar» 4. Pulsar «Ocultar» | En el paso 2 la contraseña se ve oculta; en el 3 se ve el texto; en el 4 vuelve a ocultarse | `login.spec.ts` · criterio 4 |
| CP-LOG-08 | 2. Vuelve a la página en la que estaba (búsqueda, #224) | Sin sesión iniciada | 1. Ir a `/buscar?q=taladro` 2. Pulsar «Iniciar sesión» en la cabecera 3. Iniciar sesión con `ana@rentit.test` / `Rentit2026` | Se vuelve a `/buscar?q=taladro` con la sesión iniciada | `login.spec.ts` · criterio 2 (búsqueda) |

### US-01.3 Cerrar sesión (#47) · T25 (#105)

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-OUT-01 | 1. Hay un botón «Cerrar sesión» | Sesión iniciada como `ana@rentit.test` | 1. Ir a «Mi perfil» | Se ve el botón «Cerrar sesión» | `logout.spec.ts` · criterio 1 |
| CP-OUT-02 | 2. Cerrar sesión redirige y deja de estar autenticado | Sesión iniciada | 1. En «Mi perfil», pulsar «Cerrar sesión» | Se va a `/login`; la cabecera muestra «Iniciar sesión» y «Crear cuenta» en lugar de «Mi perfil» | `logout.spec.ts` · criterio 2 |
| CP-OUT-03 | 3. Las rutas privadas dejan de ser accesibles | Sesión iniciada | 1. En «Mi perfil», pulsar «Cerrar sesión» 2. Escribir en la barra de direcciones `/perfil` | Se redirige a `/login` | `logout.spec.ts` · criterio 3 |
| CP-OUT-04 | 4. El token anterior deja de ser válido | Sesión iniciada; token copiado (en DevTools › Application › Local Storage › `rentit.session`) | 1. En «Mi perfil», pulsar «Cerrar sesión» 2. Llamar a `GET /api/usuarios/me` con `Authorization: Bearer <token copiado>` | La API responde `401` | `logout.spec.ts` · criterio 4 |
| CP-OUT-05 | 5. El botón «atrás» no muestra contenido privado | Sesión iniciada | 1. Ir a «Mi perfil» 2. Ir a «Mis objetos» 3. Volver a «Mi perfil» y pulsar «Cerrar sesión» 4. Pulsar «atrás» en el navegador | No se ve contenido privado: se redirige a `/login` | `logout.spec.ts` · criterio 5 |

### TR-08 Página de ayuda (#89)

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-AYU-01 | 1. La página `/ayuda` está publicada | Sin sesión iniciada | 1. Ir a `/` 2. Pulsar el icono de ayuda de la cabecera | Se abre `/ayuda` con el título «Ayuda» | `ayuda.spec.ts` · criterio 1 |
| CP-AYU-02 | 2. Explica los flujos entregados | — | 1. Ir a `/ayuda` 2. Pulsar cada entrada del índice «En esta página» | Hay una sección con pasos numerados para cada flujo entregado (crear una cuenta, iniciar sesión, ver tu perfil, cerrar sesión, buscar, filtrar, ver la ficha, solicitar un alquiler, consultar y responder solicitudes, y publicar, editar, pausar y retirar un objeto), y el índice lleva a cada una | `ayuda.spec.ts` · criterio 2 |
| CP-AYU-03 | 3. Se actualiza en cada sprint | Antes de la demo | 1. Comparar las secciones con las historias del sprint que están en `develop` | Cada flujo entregado tiene su sección; si falta, se añade a la página y a `DELIVERED_FLOWS` de `ayuda.spec.ts` | Revisión manual |

### Smoke test · T19 (#99)

| ID | Qué comprueba | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|
| CP-SMK-01 | La API está en marcha | `GET /api/health` | `200` con `{ "status": "ok" }` | `smoke.spec.ts` |
| CP-SMK-02 | La página inicial carga | Ir a `/` | Se ve el título «Rentit» y no hay errores de JavaScript | `smoke.spec.ts` |
| CP-SMK-03 | Flujo básico de registro y login | 1. Registrarse con un usuario nuevo 2. Cerrar sesión 3. Iniciar sesión con ese usuario | Tras el registro y tras el login se ve «Hola, <usuario>» | `smoke.spec.ts` |

### US-03.01 Buscar objetos (#56) · S1-T14 (#116)

Objetos del seed (`backend/prisma/demoData.ts`): «Taladro percutor Bosch» (publicado) y «Tienda de campaña para 4 personas» (pausado).

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-BUS-01 | 1. Se puede escribir el nombre de un objeto | Seed cargado | 1. Ir a `/` | Se ven el campo «¿Qué quieres alquilar?» y el botón «Buscar» | `buscar-objetos.spec.ts` · criterio 1 |
| CP-BUS-02 | 2. Buscar muestra los anuncios relacionados | Seed cargado | 1. Escribir `taladro` 2. Pulsar «Buscar» 3. Pulsar el anuncio | Se va a `/buscar?q=taladro` con «Resultados para «taladro»»; sale «Taladro percutor Bosch» y ningún anuncio sin «taladro» en el nombre. El anuncio lleva a `/objetos/<id>` | `buscar-objetos.spec.ts` · criterio 2 |
| CP-BUS-03 | 3. Sin texto no pasa nada | — | 1. Dejar el campo vacío (o solo espacios) 2. Pulsar «Buscar» | La página y la URL no cambian | `buscar-objetos.spec.ts` · criterio 3 |
| CP-BUS-04 | 4. Sin resultados | — | 1. Buscar `xyzzy-no-existe` | Se muestra «No hemos encontrado ningún objeto para «xyzzy-no-existe».» | `buscar-objetos.spec.ts` · criterio 4 |
| CP-BUS-05 | (Estado) No salen pausados ni retirados | Seed cargado | 1. Buscar `tienda` | No sale «Tienda de campaña para 4 personas» (pausado) y se muestra el mensaje de sin resultados. Los retirados los cubre el test de API de #114 | `buscar-objetos.spec.ts` · estado |

### US-03.03 Ver un objeto (#58) · S1-T37 (#175)

Se llega a la ficha desde la búsqueda de `taladro` (US-03.01): «Taladro percutor Bosch» es de ana, cuesta 6 €/día y está publicado.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-VER-01 | 1. Abrir un anuncio desde los resultados | Seed cargado | 1. Ir a `/buscar?q=taladro` 2. Pulsar «Taladro percutor Bosch» | Se abre `/objetos/<id>` con el título del objeto | `ver-objeto.spec.ts` · criterio 1 |
| CP-VER-02 | 2. La ficha muestra los datos del objeto | Seed cargado | 1. Abrir la ficha | Se ven la descripción, «6,00 € / día» y «Disponible» en el panel lateral, y las fotos con sus miniaturas (o «Este objeto no tiene fotos.» si no tiene) | `ver-objeto.spec.ts` · criterio 2 |
| CP-VER-03 | 3. Información pública del propietario | — | 1. Abrir la ficha | Se ve «Publicado por ana» y en la ficha no aparece ningún correo | `ver-objeto.spec.ts` · criterio 3 |
| CP-VER-04 | 4. Alquilar con sesión | Sesión de bruno | 1. Abrir la ficha 2. Ir a `/objetos/<id>/solicitar` | En la ficha, el panel muestra las dos fechas y «Solicitar alquiler» desactivado, sin botón «Alquilar» (US-04.01). La URL antigua redirige a la ficha | `ver-objeto.spec.ts` · criterio 4a |
| CP-VER-05 | 4. «Alquilar» sin sesión | Sin sesión | 1. Abrir la ficha 2. Pulsar «Alquilar» | Se va a `/login`; tras iniciar sesión se vuelve a la ficha, con las fechas en el panel | `ver-objeto.spec.ts` · criterio 4b |
| CP-VER-06 | 4. El propietario no alquila su objeto | Sesión de ana | 1. Abrir la ficha | Se ve «Este anuncio es tuyo.», sin botón «Alquilar» ni fechas | `ver-objeto.spec.ts` · criterio 4c |
| CP-VER-07 | (Errores) Objeto que no existe | — | 1. Ir a `/objetos/00000000-0000-4000-8000-000000000000` | Se ve «No hemos encontrado este objeto» y el enlace «Volver al inicio» | `ver-objeto.spec.ts` · errores |

### US-02.02 Editar un objeto (#51) · S1-T33 (#171)

Se edita la «Hidrolimpiadora Kärcher» de ana (8 €/día, fianza 50 €), que no usa ningún otro e2e. Cada test la deja como estaba al terminar. Del criterio 2, la disponibilidad se cambia con «Pausar» y «Reanudar» en «Mis objetos» (US-02.04), igual que «Disponible ya» o «Pausado» al publicar. Añadir fotos se comprueba en los unitarios (`editItem.test.tsx`). Borrar fotos queda para el Sprint 2 (decisión de Marc, 03/11).

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-EDI-01 | 1. Elegir un objeto propio y pulsar «Editar» | Sesión de ana | 1. «Mis objetos» 2. «Editar» en la hidrolimpiadora | Se abre «Editar objeto» con su nombre, descripción, precio y fianza actuales | `editar-objeto.spec.ts` · criterio 1 |
| CP-EDI-02 | 2. Se pueden modificar los campos | Como CP-EDI-01 | 1. Abrir la edición | Nombre, descripción, precio por día y fianza son editables. La disponibilidad se cambia con pausar y reanudar (CP-PAU) | `editar-objeto.spec.ts` · criterio 2 |
| CP-EDI-03 | 3. Guardar con valores válidos | Como CP-EDI-01 | 1. Cambiar el nombre y el precio a `11,50` 2. «Guardar» 3. Recargar | Tras recargar, la lista y el formulario muestran el nombre y el precio nuevos | `editar-objeto.spec.ts` · criterio 3 |
| CP-EDI-04 | 4. Campo erróneo | Como CP-EDI-01 | 1. Precio `-5` 2. «Guardar» 3. Recargar | Sale el error del precio con el campo marcado. Tras recargar, sigue a 8 € | `editar-objeto.spec.ts` · criterio 4 |
| CP-EDI-05 | (Permisos) No propietario | Sesión de bruno | 1. «Mis objetos» 2. `PATCH /api/objetos/<id>` con el token de bruno | La hidrolimpiadora no aparece en sus objetos y la API responde `403` | `editar-objeto.spec.ts` · permisos |
| CP-EDI-06 | 2. Añadir fotografías | Como CP-EDI-01, con un almacenamiento S3 configurado | 1. Elegir una foto en «Añadir fotografías» 2. «Guardar» | Sale «Los cambios se han guardado.» y la foto queda en el objeto | Manual: el CI no tiene almacenamiento. Tests de componente en `editItem.test.tsx` |

### US-04.02 Consultar mis solicitudes (#61) · S1-T38 (#176)

Solicitudes del seed (`DEMO_RESERVATIONS` en `backend/prisma/demoData.ts`, #210): bruno pide a ana la escalera (aceptada), y ana pide a bruno el proyector (pendiente) y el altavoz (rechazada). Las pendientes del taladro y del carro son para los e2e de aceptar y rechazar, y estos tests no las usan.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-MSO-01 | 1. La lista muestra objeto, fechas y estado | Sesión de bruno | 1. Pulsar «Mis solicitudes» en la cabecera | En «Enviadas» sale la escalera, con sus fechas y «Aceptada» | `mis-solicitudes.spec.ts` · criterio 1 |
| CP-MSO-02 | 2. Estados «Pendiente», «Aceptada» y «Rechazada» | Sesión de ana | 1. Ir a «Mis solicitudes» | Proyector «Pendiente» y altavoz «Rechazada» en «Enviadas», y escalera «Aceptada» en «Recibidas» | `mis-solicitudes.spec.ts` · criterio 2 |
| CP-MSO-03 | 3. Abrir el detalle | Sesión de ana | 1. Pulsar la solicitud del proyector | Se despliega con el enlace al objeto, «Fecha: …» (es de un solo día), «Importe total: 12,00 €», «Estado: Pendiente» y «Propietario: bruno» | `mis-solicitudes.spec.ts` · criterio 3 |
| CP-MSO-04 | 4. Sin solicitudes | Usuario recién registrado | 1. Ir a «Mis solicitudes» | «No tienes solicitudes abiertas» en «Enviadas» y «Todavía no has recibido solicitudes.» en «Recibidas» | `mis-solicitudes.spec.ts` · criterio 4 |
| CP-MSO-05 | (Recibidas) El propietario ve las que le llegan | Sesión de ana | 1. Abrir la solicitud de la escalera en «Recibidas» | Sale «Solicitada por: bruno», y la escalera no aparece en «Enviadas» | `mis-solicitudes.spec.ts` · recibidas |
| CP-MSO-06 | (Acceso) Sin sesión | Sin sesión | 1. Ir a `/mis-solicitudes` | Se redirige a `/login` | `mis-solicitudes.spec.ts` · acceso |

### US-04.01 Solicitar un alquiler (#60) · S1-T21 (#122)

bruno solicita el «Cortacésped eléctrico» de ana (9 €/día). Las fechas son aleatorias, dentro de 1 a 2 años, para poder repetir los tests. La «Escalera de aluminio» de ana tiene en el seed (#210) una solicitud aceptada para dentro de 14 y 15 días, así que esas fechas están ocupadas. Todo el flujo ocurre en el panel lateral de la ficha, sin cambiar de pantalla.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-SOL-01 | 1. Elegir fechas de inicio y fin | Sesión de bruno | 1. Buscar `cortacésped` y abrir la ficha 2. Escribir inicio y fin en el panel, con formato `dd/mm/aaaa` | Quedan las dos fechas elegidas, sin error | `solicitar-alquiler.spec.ts` · criterio 1 |
| CP-SOL-01b | 1. Elegir fechas en el calendario | Como CP-SOL-01 | 1. Avanzar con «Mes siguiente» 2. Pulsar el día 10 3. Pulsar el día 12 4. «Solicitar alquiler» 5. «Volver» | Los campos muestran las fechas pulsadas y el 11 queda dentro del rango, con el precio de 3 días. El resumen las enseña y «Volver» las conserva | `solicitar-alquiler.spec.ts` · criterio 1 |
| CP-SOL-01c | 1. Los días pasados no se pueden elegir | Como CP-SOL-01 | 1. Mirar el mes actual en el calendario | Hoy se puede pulsar; ayer (si es del mismo mes) está desactivado, y «Mes anterior» también | `solicitar-alquiler.spec.ts` · criterio 1 |
| CP-SOL-02 | 1. El fin no puede ser anterior al inicio | Como CP-SOL-01 | 1. Escribir un fin anterior al inicio (en el calendario no se puede) | «La fecha de fin no puede ser anterior a la fecha de inicio.» y «Solicitar alquiler» desactivado | `solicitar-alquiler.spec.ts` · criterio 1 |
| CP-SOL-03 | 2. Se muestra el precio del periodo | Como CP-SOL-01 | 1. Elegir 3 días | «3 días × 9,00 € = 27,00 €» (las dos fechas cuentan) | `solicitar-alquiler.spec.ts` · criterio 2 |
| CP-SOL-04 | 3. Con fechas disponibles se puede solicitar | Como CP-SOL-01 | 1. Fechas libres del cortacésped 2. Fechas de la escalera dentro de 13 y 14 días | En el paso 1, «Solicitar alquiler» está activo. En el 2 sale «El objeto no está disponible en esas fechas.» y el botón está desactivado | `solicitar-alquiler.spec.ts` · criterio 3 |
| CP-SOL-05 | 4. Resumen antes de enviar | Fechas libres | 1. «Solicitar alquiler» | En el mismo panel y la misma URL, «Revisa tu solicitud» con el objeto, «Desde», «Hasta», «Importe del alquiler (3 días)», 27,00 €, «Volver» y «Confirmar». Todavía no se ha creado ninguna solicitud | `solicitar-alquiler.spec.ts` · criterio 4 |
| CP-SOL-06 | 5. Confirmar crea la solicitud «Pendiente» | CP-SOL-05 | 1. «Confirmar» | Se va a «Mis solicitudes» y en «Enviadas» sale el cortacésped «Pendiente». bruno tiene una solicitud enviada más | `solicitar-alquiler.spec.ts` · criterio 5 |
| CP-SOL-07 | (Permisos) No se puede alquilar un objeto propio | Sesión de ana | 1. Abrir la ficha del cortacésped 2. `POST /api/reservas` con el token de ana | «Este anuncio es tuyo.», sin botón «Alquilar» ni fechas, y la API responde `403` | `solicitar-alquiler.spec.ts` · permisos |

### US-02.04 Pausar un objeto (#53) · S1-T35 (#173)

Se pausa la «Tabla de paddle surf hinchable» de ana. Al terminar cada test se reanuda por la API si ha quedado pausada, para que los e2e de buscar y filtrar la sigan viendo.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-PAU-01 | 1. Un objeto pausado no aparece en la búsqueda | Sesión de ana | 1. «Mis objetos» 2. «Pausar» en la tabla de paddle 3. Con la sesión de bruno, buscar `paddle` | Sale «El anuncio se ha pausado: no aparecerá en las búsquedas hasta que lo reanudes.». bruno ve «No hemos encontrado ningún objeto para «paddle».» | `pausar-objeto.spec.ts` · criterio 1 |
| CP-PAU-02 | 1. …pero sigue en «Mis objetos» | CP-PAU-01 hecho | 1. Recargar «Mis objetos» | La tabla sigue en la lista como «Pausado», con «No aparece en las búsquedas hasta que lo reanudes» y el botón «Reanudar» | `pausar-objeto.spec.ts` · criterio 1 |
| CP-PAU-03 | (Reanudar) Vuelve a aparecer | CP-PAU-01 hecho | 1. «Reanudar» 2. Con la sesión de bruno, buscar `paddle` | Sale «El anuncio se ha reanudado y vuelve a aparecer en las búsquedas.», la fila vuelve a «Publicado» y bruno la encuentra | `pausar-objeto.spec.ts` · reanudar |
| CP-PAU-04 | (Permisos) Un no propietario no puede pausarlo | Sesión de bruno | 1. «Mis objetos» 2. `POST /api/objetos/<id>/pausar` con el token de bruno | No le sale el botón «Pausar» de la tabla, la API responde `403` y sigue publicada | `pausar-objeto.spec.ts` · permisos |

### US-02.03 Retirar un objeto (#52) · S1-T34 (#172)

Retirar no se puede deshacer, así que solo se retira de verdad la «Máquina de palomitas» de bruno, que no usa ningún otro e2e. `npm run db:seed` la vuelve a dejar publicada. La «Silla de coche para bebé» de ana se usa para cancelar y para los permisos, y la «Escalera de aluminio» tiene en el seed (#210) una solicitud aceptada.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-RET-01 | 1. Elegir un anuncio propio y pulsar «Retirar anuncio» | Sesión de ana | 1. «Mis objetos» 2. «Retirar anuncio» en la silla | Se abre el diálogo «¿Seguro que quieres retirar «Silla de coche para bebé»?» con «Retirar anuncio» y «Cancelar» | `retirar-objeto.spec.ts` · criterio 1 |
| CP-RET-02 | 2. Confirmar retira el anuncio | Sesión de bruno, con la máquina de palomitas publicada | 1. «Retirar anuncio» en la máquina de palomitas 2. Confirmar 3. Con la sesión de ana, buscar `palomitas` y abrir su ficha | Sale «El anuncio se ha retirado.» y la fila queda como «Retirado», sin acciones. ana no la encuentra en la búsqueda y la ficha muestra «No hemos encontrado este objeto», sin «Alquilar» | `retirar-objeto.spec.ts` · criterio 2 |
| CP-RET-03 | 3. Cancelar no cambia nada | Como CP-RET-01 | 1. «Cancelar» en el diálogo 2. Buscar `silla` | La silla sigue «Publicado» y sale en la búsqueda | `retirar-objeto.spec.ts` · criterio 3 |
| CP-RET-04 | 4. Un no propietario no puede retirarlo | Sesión de bruno | 1. Abrir la ficha de la silla 2. `POST /api/objetos/<id>/retirar` con el token de bruno | En la ficha no hay «Retirar anuncio», la API responde `403` y la silla sigue publicada | `retirar-objeto.spec.ts` · criterio 4 |
| CP-RET-05 | (Supuesto de #110) Con reservas activas no se retira | Sesión de ana | 1. «Retirar anuncio» en la escalera 2. Confirmar | El diálogo muestra «No puedes retirar un objeto con reservas activas.» y la escalera sigue publicada | `retirar-objeto.spec.ts` · reservas activas |

### US-04.03 Aceptar una solicitud (#62) · S1-T39 (#177)

Solicitudes del seed (#210). bruno ha pedido a ana el taladro (pendiente: se acepta en el criterio 2), la escalera (ya aceptada) y el carro (pendiente). ana ha pedido a bruno el proyector (pendiente). El criterio 2 cambia la BD: en local, vuelve a ejecutar `npm run db:seed` antes de repetirlo.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-ACE-01 | 1. El propietario ve objeto, quién lo pide, fechas y estado | Sesión de bruno | 1. «Mis solicitudes» 2. Abrir el proyector en «Recibidas» | Se ven el enlace al objeto, «Solicitada por: ana», las fechas, «Estado: Pendiente» y el botón «Aceptar» | `aceptar-solicitud.spec.ts` · criterio 1 |
| CP-ACE-02 | 2. Aceptar una solicitud «Pendiente» | Sesión de ana | 1. Abrir el taladro en «Recibidas» 2. Pulsar «Aceptar» | Sale «Has aceptado la solicitud.» y pasa a «Aceptada». bruno la ve «Aceptada» en «Enviadas» | `aceptar-solicitud.spec.ts` · criterio 2 |
| CP-ACE-03 | 3. Una aceptada no se puede volver a aceptar ni rechazar | Sesión de ana | 1. Abrir la escalera (aceptada) 2. Llamar a `POST /api/reservas/:id/aceptar` y `/rechazar` | No hay botones. La API responde `409` y sigue «Aceptada» | `aceptar-solicitud.spec.ts` · criterio 3 |
| CP-ACE-04 | (Permisos) Solo el propietario acepta | — | 1. `POST /api/reservas/<id del carro>/aceptar` con el token de bruno | `403`, y la solicitud sigue «Pendiente» | `aceptar-solicitud.spec.ts` · permisos |

### US-02.01 Publicar un objeto (#50) · S1-T5 (#107)

Se publica sin fotos, porque la subida va a S3 y en el CI no hay almacenamiento (las fotos son opcionales). Cada anuncio lleva un nombre único («Lijadora e2e <n>») para poder repetir los tests.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-PUB-01 | 1. Se ven los campos del anuncio | Sesión de ana | 1. En «Mis objetos», «Publicar un objeto» | Se va a `/objetos/nuevo` y se ven Nombre, Descripción, Fotografías, Precio por día, Disponibilidad y «Publicar» | `publicar-objeto.spec.ts` · criterio 1 |
| CP-PUB-02 | 2. Se puede elegir la categoría | Sesión de ana | 1. Abrir «Categoría» | Están las 8 categorías de la migración y se puede elegir una | `publicar-objeto.spec.ts` · criterio 2 |
| CP-PUB-03 | 3. Publicar con datos válidos | Sesión de ana | 1. Rellenar nombre, descripción, «Herramientas y bricolaje», `7,50`, fianza `20` y «Sants» 2. «Publicar» | Se va a la ficha con esos datos («7,50 € / día», «Fianza: 20,00 €», «Disponible»…) y el objeto sale en la búsqueda | `publicar-objeto.spec.ts` · criterio 3 |
| CP-PUB-04 | 4. El anuncio es de quien lo crea | Sesión de ana | 1. Publicar 2. Abrir la ficha con la sesión de bruno | ana ve «Publicado por ana» y «Este anuncio es tuyo.». bruno ve «Publicado por ana» y las fechas en el panel | `publicar-objeto.spec.ts` · criterio 4 |
| CP-PUB-05 | 5. Campo erróneo (precio) | Sesión de ana | 1. Todo válido salvo el precio `0` 2. «Publicar» | No se publica (sigue en `/objetos/nuevo` y no sale en la búsqueda) y bajo el precio sale «El campo "precio" no es correcto, revísalo.» | `publicar-objeto.spec.ts` · criterio 5a |
| CP-PUB-06 | 5. Campo obligatorio vacío | Sesión de ana | 1. Nombre vacío 2. «Publicar» | No se publica y bajo el nombre sale «El campo "nombre" no es correcto, revísalo.» | `publicar-objeto.spec.ts` · criterio 5b |
| CP-PUB-07 | (Acceso) Sin sesión | Sin sesión | 1. Ir a `/objetos/nuevo` | Se redirige a `/login` | `publicar-objeto.spec.ts` · acceso |

### US-04.04 Rechazar una solicitud (#63) · S1-T40 (#178)

Solicitudes del seed (#210). bruno ha pedido a ana el carro (pendiente: se rechaza en el criterio 2). ana ha pedido a bruno el altavoz (ya rechazada) y el proyector (pendiente). El criterio 2 cambia la BD: en local, vuelve a ejecutar `npm run db:seed` antes de repetirlo.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-REC-01 | 1. El propietario ve objeto, quién lo pide, fechas y estado | Sesión de bruno | 1. «Mis solicitudes» 2. Abrir el proyector en «Recibidas» | Se ven el enlace al objeto, «Solicitada por: ana», las fechas, «Estado: Pendiente» y el botón «Rechazar» | `rechazar-solicitud.spec.ts` · criterio 1 |
| CP-REC-02 | 2. Rechazar una solicitud «Pendiente» | Sesión de ana | 1. Abrir el carro en «Recibidas» 2. Pulsar «Rechazar» | Sale «Has rechazado la solicitud.» y pasa a «Rechazada». bruno la ve «Rechazada» en «Enviadas» | `rechazar-solicitud.spec.ts` · criterio 2 |
| CP-REC-03 | 3. Una rechazada no se puede volver a aceptar ni rechazar | Sesión de bruno | 1. Abrir el altavoz (rechazada) en «Recibidas» 2. Llamar a la API de aceptar y de rechazar | No hay botones. La API responde `409` y sigue «Rechazada» | `rechazar-solicitud.spec.ts` · criterio 3 |
| CP-REC-04 | (Permisos) Solo el propietario rechaza | — | 1. `POST /api/reservas/<id del proyector>/rechazar` con el token de ana | `403`, y la solicitud sigue «Pendiente» | `rechazar-solicitud.spec.ts` · permisos |

### US-03.02 Filtrar objetos (#57) · S1-T36 (#174)

Objetos del seed (`backend/prisma/demoData.ts`). En Deporte están la bicicleta (10 €/día) y la tabla de paddle (15 €). Hasta 4 €/día hay tres objetos publicados. En Sant Andreu, cuatro.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-FIL-01 | 1. Los filtros se ven en la búsqueda | Página de resultados, en escritorio | 1. Ir a `/buscar?q=taladro` | Sin abrir nada, a la izquierda de los resultados se ven «Categoría», «Precio máximo (€/día)» y «Barrio». El botón «Filtros» no sale | `filtrar-objetos.spec.ts` · criterio 1 |
| CP-FIL-02 | 2-3. Filtrar por categoría | Seed cargado | 1. Elegir «Deporte» 2. «Aplicar filtros» | Solo salen la bicicleta y la tabla de paddle, las dos de «Deporte» | `filtrar-objetos.spec.ts` · criterios 2 y 3 |
| CP-FIL-03 | 2-3. Filtrar por precio máximo | Seed cargado | 1. Precio máximo `4` 2. «Aplicar filtros» | Solo salen objetos de 4 €/día o menos, incluido el de 4 € | `filtrar-objetos.spec.ts` · criterios 2 y 3 |
| CP-FIL-04 | 2-3. Filtrar por ubicación | Seed cargado | 1. Barrio `sant andreu` 2. «Aplicar filtros» | Salen los 4 objetos de Sant Andreu y ninguno de otro barrio | `filtrar-objetos.spec.ts` · criterios 2 y 3 |
| CP-FIL-05 | 4. Varios filtros a la vez | Seed cargado | 1. «Deporte» y precio máximo `10` 2. «Aplicar filtros» 3. Quitar el chip «Hasta 10 €/día» | En el paso 2 solo sale la bicicleta y hay dos chips. En el 3 vuelve la tabla de paddle, queda un chip, se mantiene la categoría y el campo de precio se vacía | `filtrar-objetos.spec.ts` · criterio 4 |
| CP-FIL-06 | 5. Limpiar filtros | `/buscar?q=taladro` con precio máximo `2` (sin resultados) | 1. Pulsar «Limpiar filtros» | Se vuelve a `/buscar?q=taladro` y sale otra vez el taladro | `filtrar-objetos.spec.ts` · criterio 5 |
| CP-FIL-07 | (Validación) Precio máximo no válido | — | 1. Precio máximo `-5` 2. «Aplicar filtros» | No cambia la URL. Bajo el campo sale «El campo "precio máximo" no es correcto, revísalo.» | `filtrar-objetos.spec.ts` · validación |
| CP-FIL-08 | 5. Limpiar filtros desde el panel | `/buscar?q=taladro&maxPrice=10`, en escritorio | 1. Pulsar «Limpiar filtros» en el panel | Se vuelve a `/buscar?q=taladro` y el campo de precio se vacía | `filtrar-objetos.spec.ts` · criterio 5 |
| CP-FIL-09 | 1. En móvil, los filtros se abren con su botón | Página de resultados, a 390 px | 1. Pulsar «Filtros» 2. Precio máximo `10` 3. «Aplicar filtros» 4. «Limpiar filtros» junto a los chips | En el paso 1 se abre el panel. En el 3 se cierra y el botón dice «Filtros (1)». En el 4 se vuelve a `/buscar?q=taladro` | `filtrar-objetos.spec.ts` · en móvil |
| CP-FIL-10 | (Móvil) Sin scroll horizontal | Página de resultados, a 390 px | 1. Ir a `/buscar?q=taladro` | La página no se desplaza en horizontal | `filtrar-objetos.spec.ts` · en móvil |

### US-04.07 Ver la demanda de cada fecha en el calendario (#303) · S2-T33 (#313)

Datos del seed (`DEMO_DEMAND_REQUESTS` en `backend/prisma/demoData.ts`): la bicicleta de montaña de bruno tiene seis solicitudes pendientes; ana ve 1 el día +8, 6 el +10 y 4 el +11. Las de vecino1 no cuentan para sí mismo. La escalera de ana tiene los días +14 y +15 reservados por bruno.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-DEM-01 | 1. Color y etiqueta accesible por nivel | Seed cargado; sesión de ana | 1. Abrir la bicicleta 2. Revisar +8, +10, +11 y +13 | Los días tienen sus clases y aria-label según 1, 6, 4 y 0 solicitudes; los cuatro colores son distintos | `demanda-calendario.spec.ts` · criterio 1 |
| CP-DEM-02 | 2. Leyenda | Seed cargado; sesión de ana | 1. Abrir la bicicleta | Se muestran, en orden, «Libre», «Poca demanda (1–2)», «Demanda media (3–5)», «Mucha demanda (6 o más)» y «Reservado» | `demanda-calendario.spec.ts` · criterio 2 |
| CP-DEM-03 | 3. Detalle al señalar o elegir un día | Seed cargado; sesión de ana | 1. Señalar +10 y +8 2. Pulsar +13 | Se muestran los respectivos números; al elegir +13 aparece «Ninguna solicitud para este día» y se rellena «Fecha de inicio» | `demanda-calendario.spec.ts` · criterio 3 |
| CP-DEM-04 | 4. Solicitudes coincidentes con las fechas | Seed cargado; sesión de ana | 1. Elegir +10 a +11 2. Elegir +8 a +8 3. Elegir +13 a +13 | Los avisos cuentan 6 (sin duplicar solicitudes) y 1; con +13 no hay aviso y «Solicitar alquiler» está activo | `demanda-calendario.spec.ts` · criterio 4 |
| CP-DEM-05 | 5. No revelar la identidad de quienes solicitan | Seed cargado; sesión de ana | 1. Abrir la bicicleta 2. Consultar la demanda por API entre +8 y +12 | La ficha no menciona vecinos; la respuesta solo tiene `days`, `pendingRequests` y `bookedDays`, y cada día solo `date` y `pendingRequests`, sin correo ni id de usuario | `demanda-calendario.spec.ts` · criterio 5 |
| CP-DEM-06 | Las solicitudes propias no cuentan | Seed cargado; sesión de vecino1 | 1. Abrir la bicicleta 2. Revisar +8 y +10 | +8 está libre y +10 tiene 5 solicitudes (`has-demand-2`) | `demanda-calendario.spec.ts` · propias |
| CP-DEM-07 | Error al cargar la demanda | Sesión de ana | 1. Hacer que la API de demanda responda `500` 2. Abrir la bicicleta 3. Pulsar +13 | Se muestra el error, no hay leyenda ni colores, y el día sigue rellenando la fecha de inicio | `demanda-calendario.spec.ts` · error |
| CP-DEM-08 | Días reservados | Seed cargado; sesión de bruno | 1. Abrir la escalera 2. Revisar +14, +15 y +13 | +14 y +15 tienen «Reservado», `is-booked` y están desactivados; +13 está activo | `demanda-calendario.spec.ts` · días reservados |
| CP-DEM-09 | El propietario no alquila su objeto | Seed cargado; sesión de bruno | 1. Abrir su bicicleta | Se ve «Este anuncio es tuyo.», sin calendario ni leyenda | `demanda-calendario.spec.ts` · permisos |

### US-10.03 Solicitar ser rider (#304) · S2-T36 (#316)

**Datos comunes:** BD con el seed cargado. Usuarios: `carla@rentit.test` (rider pendiente), `dani@rentit.test` (rider aceptado), `ana@rentit.test` y `bruno@rentit.test` (cuentas normales). Contraseña: `Rentit2026`.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-RID-01 | 1. Una persona sin sesión puede abrir «Hazte rider» | Sin sesión | 1. Comprobar que «Principal» no tiene «Hazte rider» 2. Pulsar «Crear cuenta» y, debajo del formulario, «Hazte rider» | Se abre `/hazte-rider` con el título, la información de la solicitud y el botón «Enviar solicitud» | `hazte-rider.spec.ts` · criterio 1a |
| CP-RID-02 | 1. Una cuenta normal no ve el enlace ni el formulario | Sesión de ana | 1. Comprobar la cabecera 2. Ir a `/hazte-rider` | No hay enlace «Hazte rider» y la ruta vuelve a `/` | `hazte-rider.spec.ts` · criterio 1b |
| CP-RID-03 | 2. Se muestran todos los campos y opciones del cuestionario | Sin sesión | 1. Ir a `/hazte-rider` | Hay campos de cuenta, teléfono y zona; 5 vehículos, 7 días, 3 franjas, aceptación de condiciones y «Enviar solicitud» | `hazte-rider.spec.ts` · criterio 2a |
| CP-RID-04 | 2. Enviar el formulario vacío valida todos los campos | Sin sesión | 1. Ir a `/hazte-rider` 2. Pulsar «Enviar solicitud» | Cada campo tiene su mensaje y `aria-invalid="true"`; el foco queda en «Nombre de usuario» y no se muestra la confirmación | `hazte-rider.spec.ts` · criterio 2b |
| CP-RID-05 | 2. Se valida el teléfono y la contraseña | Sin sesión | 1. Completar el formulario, excepto el teléfono `12345` y la contraseña `corta` 2. Enviar | Solo teléfono y contraseña quedan inválidos y muestran sus errores | `hazte-rider.spec.ts` · criterio 2c |
| CP-RID-06 | 2. No se puede reutilizar un correo registrado | Sin sesión; ana existe en el seed | 1. Completar el formulario con `ana@rentit.test` 2. Enviar | El correo queda inválido con «Ya existe una cuenta con este correo.» | `hazte-rider.spec.ts` · criterio 2d |
| CP-RID-07 | 3. Una solicitud válida crea una cuenta rider pendiente | Sin sesión; nombre y correo únicos | 1. Completar y enviar el formulario 2. Pulsar «Iniciar sesión» 3. Iniciar sesión 4. Consultar el login de la API | Se muestra «Solicitud enviada», el correo se rellena en login, la home indica «Pendiente de revisión» y la API devuelve `isRider: true`, `riderStatus: "pending"` | `hazte-rider.spec.ts` · criterio 3 |
| CP-RID-08 | 4. El rider pendiente no ve ni abre «Trabajos» | Sesión de carla | 1. Iniciar sesión 2. Ir a `/trabajos` | En la home ve «Tu solicitud para ser rider» y «Pendiente de revisión»; `/trabajos` vuelve a `/` | `hazte-rider.spec.ts` · criterio 4a |
| CP-RID-09 | 4. El rider aceptado ve «Trabajos» | Sesión de dani | 1. Iniciar sesión | Se abre `/trabajos`, la cabecera enlaza a «Trabajos» y se ve ese título | `hazte-rider.spec.ts` · criterio 4b |
| CP-RID-10 | 5. El rider no puede solicitar ni publicar desde la web | Sesión de dani | 1. Revisar la cabecera 2. Ir a `/buscar?q=taladro`, `/objetos/nuevo` y `/mis-objetos` | No ve «Mis objetos» ni «Mis solicitudes»; cada ruta lleva a `/trabajos` | `hazte-rider.spec.ts` · criterio 5a |
| CP-RID-11 | 5. La API bloquea solicitudes y publicaciones para riders | Seed cargado; token de carla, dani y bruno | 1. Buscar el cortacésped y una categoría 2. Crear la misma reserva válida con bruno (con la tarjeta de prueba, `ctoken_simulado`, y recogida en casa) y un objeto con un modo de entrega 3. Enviar reserva y objeto con los tokens de carla y dani | La reserva de bruno responde `201`; los POST de riders responden `403` y `{ "error": "Las cuentas de rider no pueden solicitar ni publicar objetos." }` | `hazte-rider.spec.ts` · criterio 5b |
| CP-RID-12 | 4. Una cuenta rider rechazada no ve trabajos y ve el motivo | eva, rechazada en el seed con motivo | 1. Iniciar sesión con esa cuenta | No ve «Trabajos»; ve «Solicitud rechazada» y «Motivo: Zona sin cobertura de reparto por ahora.» | `admin-riders.spec.ts` · eva (US-11.03, #319) |

### US-07.01 Registrar un pago (#72) · S2-T12 (#287)

Se usan bruno, ana y el «Cortacésped eléctrico» del seed (9 €/día, fianza de 60 €); las fechas de cada solicitud son aleatorias, a 3–4 años, para poder repetir los tests.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-PAG-01 | 2 y 3. Resumen y condiciones del pago | Sesión de bruno | 1. Elegir 3 días en la ficha y la recogida en casa, y continuar a «Confirmar y pagar» | El resumen muestra el objeto, fechas, 27,00 €, fianza retenida de 60 € y total de 87,00 €. Se explica el bloqueo, la aceptación de ana y las tarjetas de prueba | `registrar-pago.spec.ts` · criterios 2 y 3 |
| CP-PAG-02 | 5. Tarjeta rechazada | Sesión de bruno | 1. Pagar un día con `4000 0000 0000 0002` | Sale «Tu tarjeta ha sido rechazada.», la página conserva las fechas, el botón vuelve a estar activo y no se crea una solicitud | `registrar-pago.spec.ts` · criterio 5 |
| CP-PAG-03 | 5. Validación de tarjeta | Sesión de bruno | 1. Enviar `1234 5678 9012 3456`, `01/20` y CVC `12` | Los tres campos quedan inválidos; no se envía `POST /api/reservas` ni se crea solicitud | `registrar-pago.spec.ts` · validación |
| CP-PAG-04 | 1 y 4. Pago aceptado y reserva pagada al aceptar | Sesión de bruno | 1. Pagar con `4242 4242 4242 4242` 2. Aceptar con el token de ana | Se muestra «Solicitud enviada. Hemos bloqueado el importe hasta que ana responda.». El número de tarjeta no llega a la API; la reserva pasa de `pending` a `paid` | `registrar-pago.spec.ts` · criterios 1 y 4 |
| CP-PAG-05 | 8. No se puede aceptar dos veces | Sesión de bruno | 1. Pagar con `4242 4242 4242 4242` 2. Ana acepta dos veces | La primera respuesta es `200`; la segunda, `409` con `{"error":"Esta solicitud ya no está pendiente."}`. La reserva sigue `paid` | `registrar-pago.spec.ts` · criterio 8 |

C6 (rechazar libera el bloqueo): cubierto por `rechazar-solicitud.spec.ts`. C7 (fianza el día antes): **Pendiente de e2e**; depende de la fecha real y lo cubren los unitarios del backend.

### US-01.4 Perfil público (#48) · S2-T40 (#336)

Datos del seed (`backend/prisma/demoSeed.ts`): ana tiene bio y publica el taladro; su tienda de campaña está pausada. Nadie tiene foto ni valoraciones. Los casos que editan usan una cuenta nueva, así que no cambian la BD del seed. Sin S3 (en local y en el CI) no se pueden subir fotos: en CP-PER-09 el test simula el almacenamiento. El acceso desde las valoraciones se probará cuando existan (US-08.01 y US-08.02).

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-PER-01 | 1. Se llega al perfil desde la ficha del objeto | Seed cargado | 1. Ir a `/buscar?q=taladro` y abrir el taladro 2. En «Publicado por», pulsar «ana» 3. En «Objetos publicados», pulsar el taladro | En el paso 2 se va a `/usuarios/<id>` con el nombre, la bio, «Todavía sin valoraciones», «Miembro desde …» y el taladro, sin la tienda de campaña (pausada). En el 3 se abre la ficha del taladro | `perfil-publico.spec.ts` · criterio 1 |
| CP-PER-02 | 2. Con otra cuenta no se puede editar | Sesión de bruno | 1. Abrir el perfil de ana desde la ficha del taladro | Se ve el perfil, pero no salen «Editar perfil», «Tu perfil · así lo ven los demás», «Publicar un objeto» ni `ana@rentit.test` | `perfil-publico.spec.ts` · criterio 2 (otra cuenta) |
| CP-PER-03 | 2. Sin sesión el perfil se ve, pero no se edita | Sin sesión iniciada | 1. Abrir el perfil de ana desde la ficha del taladro | Lo mismo que en CP-PER-02 | `perfil-publico.spec.ts` · criterio 2 (sin sesión) |
| CP-PER-04 | 2. La API solo deja editar el propio perfil | — | 1. `PATCH /api/usuarios/me` sin token 2. `PATCH /api/usuarios/<id de ana>` con el token de bruno | 1: `401`. 2: `404` (no hay ninguna ruta para editar a otra persona). La bio de ana no cambia | `perfil-publico.spec.ts` · criterio 2 (API) |
| CP-PER-05 | 3. «Mi perfil» lleva al perfil propio; el correo solo lo ve su dueño | Sesión de ana | 1. Pulsar «Mi perfil» 2. Ir a `/perfil` | En el paso 1 se va a `/usuarios/<id>` con «Tu perfil · así lo ven los demás», «Editar perfil» y `ana@rentit.test` («solo lo ves tú»). En el 2 se llega al mismo perfil | `perfil-publico.spec.ts` · criterio 3 |
| CP-PER-06 | Editar la bio | Cuenta nueva con sesión | 1. «Mi perfil» › «Editar perfil» 2. Escribir una bio 3. Pulsar «Guardar» 4. Recargar la página | El contador cambia (n/500). Se cierra la ventana, sale «Perfil actualizado.» y la bio nueva, que sigue ahí al recargar | `perfil-publico.spec.ts` · editar la bio |
| CP-PER-07 | (Validación) Bio de más de 500 caracteres | Cuenta nueva con sesión | 1. «Editar perfil» 2. Escribir 501 caracteres 3. `PATCH /api/usuarios/me` con 501 caracteres | En el paso 2 el campo se queda en 500 (500/500); si se quita ese límite y se pulsa «Guardar», sale «El campo "bio" no es correcto, revísalo.» y no se envía. En el 3, `400` con ese mensaje y `field: "bio"` | `perfil-publico.spec.ts` · bio de más de 500 |
| CP-PER-08 | (Validación) Foto que no es JPG, PNG o WebP, o de más de 5 MB | Cuenta nueva con sesión | 1. «Editar perfil» 2. Elegir un GIF 3. `POST /api/usuarios/me/foto/subida` con un `size` de 6 MB | En el paso 2 sale «Solo se pueden subir fotos JPG, PNG o WebP.» sin llamar a la API. En el 3, `400` «La foto no puede ocupar más de 5 MB.» | `perfil-publico.spec.ts` · foto no válida |
| CP-PER-09 | Cambiar la foto y la bio | Cuenta nueva con sesión; almacenamiento simulado (sin S3) | 1. «Editar perfil» 2. Elegir un PNG y escribir una bio 3. Pulsar «Guardar» | Se cierra la ventana, sale «Perfil actualizado.» y el perfil muestra la bio nueva y la foto en lugar de la inicial | `perfil-publico.spec.ts` · foto y bio |
| CP-PER-10 | (Error) El usuario no existe | — | 1. Ir a `/usuarios/00000000-0000-4000-8000-000000000000` y a `/usuarios/xyz` 2. Pulsar «Volver al inicio» | En el paso 1 sale «No hemos encontrado este usuario.». En el 2 se vuelve a `/` | `perfil-publico.spec.ts` · usuario que no existe |

### US-05.01 Elegir modo y hora de entrega (#66) · S2-T8 (#283)

Antes de cada ejecución, vuelve a ejecutar `npm run db:seed` en `backend/`: los e2e de aceptar y rechazar solicitudes cambian la BD. Las solicitudes nuevas de esta suite usan fechas aleatorias de 3 a 4 años en el futuro y solo se crean para el «Cortacésped eléctrico» y la «Silla de coche para bebé». El «Carro de la compra plegable» solo se usa para consultar sus modos y comprobar el rechazo de la API; no se confirma ninguna solicitud para ese objeto.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-ENT-01 | 1. Publicar sin modos | Sesión de ana | 1. Rellenar el anuncio 2. No marcar ningún modo 3. Pulsar «Publicar» | Sale «Elige al menos un modo de entrega.» y no se envía ningún `POST` | `modo-entrega.spec.ts` · criterio 1 |
| CP-ENT-02 | 1. Recogida en casa requiere dirección | Sesión de ana | 1. Rellenar el anuncio 2. Marcar solo «Recoger en casa del propietario» 3. Dejar la dirección vacía 4. Publicar | Sale `El campo "dirección" no es correcto, revísalo.` | `modo-entrega.spec.ts` · criterio 1 |
| CP-ENT-03 | 1. Solo punto de recogida | Sesión de ana | 1. Publicar un anuncio único con solo «Punto de recogida» 2. Consultarlo en la API | No aparece el campo «Dirección», se muestra «Solo punto de recogida: no hace falta tu dirección.» y la API devuelve `homeDelivery: false`, `riderDelivery: false`, `pickupPointDelivery: true` | `modo-entrega.spec.ts` · criterio 1 |
| CP-ENT-04 | 1. Editar requiere mantener algún modo | Sesión de ana | 1. Crear un anuncio de punto de recogida 2. Editarlo 3. Desmarcar el modo 4. Guardar | Sale «Elige al menos un modo de entrega.» | `modo-entrega.spec.ts` · criterio 1 |
| CP-ENT-05 | 2. Solo se ofrecen los modos del objeto | Sesión de bruno; «Cortacésped eléctrico» y «Carro de la compra plegable» de ana | 1. Abrir la entrega de cada objeto, sin confirmar solicitudes | El Cortacésped ofrece solo recogida en casa; el Carro solo ofrece punto de recogida | `modo-entrega.spec.ts` · criterio 2 |
| CP-ENT-06 | Validar que se elija un modo | Sesión de bruno; Cortacésped | 1. Elegir fechas 2. Pulsar «Continuar» sin elegir un modo | Sale «Elige un modo de entrega.» | `modo-entrega.spec.ts` · validación |
| CP-ENT-07 | 2. La API valida el modo ofrecido | Sesión de bruno | 1. `POST /api/reservas` con `home` para el Carro 2. Repetir para el Cortacésped | El Carro responde `400` y «Este objeto no ofrece ese modo de entrega.»; el Cortacésped responde `201` | `modo-entrega.spec.ts` · criterio 2 |
| CP-ENT-08 | 3. Rider, hora, dirección, barrio y coste | Sesión de bruno; Silla | 1. Elegir rider y continuar sin completar los campos 2. Elegir «Lo antes posible», dirección y Gràcia 3. Continuar y pagar con `4242 4242 4242 4242` en «Confirmar y pagar» | Se ven los tres errores; hay «Lo antes posible» y franjas de dos horas; la tarifa es `3`, `5` o `7 €`, el total suma alquiler y entrega y la tarjeta muestra hora, coste y desglose | `modo-entrega.spec.ts` · criterio 3 |
| CP-ENT-09 | 4. La dirección del propietario depende del estado | Sesión de bruno | 1. Solicitar el Cortacésped con fechas únicas 2. Abrir la solicitud pendiente 3. Abrir la Escalera aceptada del seed 4. Consultar el objeto del Cortacésped por API | La pendiente solo muestra el aviso de dirección; la aceptada muestra la dirección de ana; la API del Cortacésped no expone la dirección | `modo-entrega.spec.ts` · criterio 4 |
| CP-ENT-10 | 5. Elegir punto de recogida | Sesión de bruno; Silla | 1. Elegir «Punto de recogida» 2. Continuar sin elegir punto 3. Elegir uno, continuar y pagar con `4242 4242 4242 4242` en «Confirmar y pagar» | Se muestran varios puntos; sin elección sale «Elige un punto de recogida.»; el seleccionado aparece en el resumen y en la tarjeta | `modo-entrega.spec.ts` · criterio 5 |
| CP-ENT-11 | 6. El propietario ve la solicitud rider sin la dirección de entrega | Sesión de ana; Taladro del seed | 1. Abrir la solicitud recibida | Se ven «Entrega por rider», la hora, el coste y el barrio Poblenou; no se ve la dirección de entrega | `modo-entrega.spec.ts` · criterio 6 |
| — | Lo ve el rider (US-10.01) | Sesión del rider | Pendiente de la historia US-10.01 | **Pendiente** | Fuera del alcance de US-05.01 |

### US-08.01 Valorar un alquiler (#74) · S2-T22 (#297)

Datos del seed: ana tiene una solicitud finalizada y sin valorar de la «Máquina de palomitas», alquilada a bruno, y una solicitud pendiente del «Proyector Full HD» de bruno. El último test cambia la BD al publicar una valoración; en local, ejecuta `npm run db:seed` en `backend/` antes de repetirlo.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-VAL-01 | 1, 2 y 3. Abrir el formulario, elegir estrellas y cancelar | Sesión de ana; seed cargado | 1. Abrir la tarjeta de la «Máquina de palomitas» en «Enviadas» 2. Pulsar «Valorar» 3. Elegir 4 estrellas 4. Pulsar «Cancelar» | Se muestra «Valorar el alquiler», las 5 puntuaciones y el comentario; queda marcada «4 estrellas: Bien». Se vuelve a `/mis-solicitudes` y la solicitud sigue sin `myRating` | `valorar-alquiler.spec.ts` · criterios 1–3 |
| CP-VAL-02 | 4 y 5. Publicar sin puntuación | Sesión de ana; valoración sin publicar | 1. Abrir la valoración de la palomitas 2. Escribir un comentario 3. Pulsar «Publicar» sin estrellas | No se publica; se muestra «Elige una puntuación de 1 a 5 estrellas.», el grupo tiene `aria-invalid="true"`, el foco queda en la primera estrella y la API sigue sin `myRating` | `valorar-alquiler.spec.ts` · criterios 4–5 |
| CP-VAL-03 | 5. La API valida puntuación y comentario | Solicitud finalizada de ana, sin valorar | 1. Enviar `POST /api/reservas/<id>/valoracion` sin `score` 2. Enviar un comentario de 1001 caracteres | Ambas peticiones responden `400`, con `field: "score"` y `field: "comment"` respectivamente; no se crea `myRating` | `valorar-alquiler.spec.ts` · criterio 5 (API) |
| CP-VAL-04 | 7. Solo quien pidió el alquiler puede valorar | Sesión de bruno; solicitud finalizada que pidió ana | 1. Abrir la palomitas en «Recibidas» 2. Intentar valorar por la API con el token de bruno | No aparece el enlace «Valorar»; la API responde `403` con «Solo quien ha alquilado el objeto puede valorar este alquiler.» | `valorar-alquiler.spec.ts` · criterio 7 |
| CP-VAL-05 | Solo se puede valorar un alquiler finalizado | Sesión de ana; solicitud pendiente del proyector | 1. Abrir el proyector en «Enviadas» 2. Ir a su ruta de valoración 3. Enviar la valoración por la API | No aparece el enlace «Valorar» y se muestra «Solo se puede valorar un alquiler finalizado.»; la API responde `409` con ese mismo error | `valorar-alquiler.spec.ts` · estado no finalizado |
| CP-VAL-06 | 6 y 8. Publicar y evitar una valoración duplicada | Sesión de ana; solicitud finalizada de la palomitas, sin valorar | 1. Elegir 4 estrellas, escribir un comentario único y publicar 2. Reabrir la ruta y enviar otro `POST` | Se muestra «Valoración publicada.» y la tarjeta muestra «Tu valoración», «4 de 5 estrellas» y el comentario entre «»; `myRating` contiene la puntuación y el comentario. Ya no hay enlace ni botón «Publicar»; el acceso directo avisa «Ya has valorado este alquiler.» y el segundo `POST` responde `409` con ese error. **Cambia la BD** | `valorar-alquiler.spec.ts` · criterios 6 y 8 |

### US-05.02 Seguimiento del estado de la entrega (#67) · S2-T16 (#291)

Datos del seed: la «Hidrolimpiadora Kärcher» de ana, alquilada por bruno, va con rider y dani ya asignado; el «Cortacésped eléctrico» de ana, alquilado por bruno, se recoge en el domicilio del propietario; la «Bicicleta de montaña talla M» de bruno, alquilada por ana, se recoge en un punto de recogida. CP-SEG-04 a 08 avanzan esas entregas: van en orden, sin reintentos, y antes de repetirlos hay que volver a ejecutar `npm run db:seed`. El botón «Valorar» del alquiler finalizado se probará cuando US-08.01 y US-08.02 estén en develop (decisión de Marc).

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-SEG-01 | 6. Solo una lista de estados con fecha y hora | Sesión de bruno | 1. «Mis solicitudes» › Hidrolimpiadora › «Ver entrega» | Se abre `/entregas/<id>` con «Entrega por rider · Franja 09:00–11:00», los pasos Asignada, Recogida, En camino y Entregada, la hora de «Asignada», el código de entrega y ningún mapa | `seguimiento-entrega.spec.ts` · criterio 6 |
| CP-SEG-02 | (Error) Solo la ven las personas de la reserva y su rider | Sesión de vecino1 | 1. Abrir `/entregas/<id>` de la Hidrolimpiadora 2. `GET /api/entregas/<id>` | Sale «No hemos encontrado esta entrega.»; la API responde `403` «Solo las personas de esta reserva y su rider pueden ver la entrega.», y `404` con un id que no existe | `seguimiento-entrega.spec.ts` · otra cuenta |
| CP-SEG-03 | 1. Solo el rider avanza, y en orden | Tokens de dani y bruno | 1. dani pide pasar de «Asignada» a «En camino» 2. bruno intenta avanzarla o marcarla como recibida 3. bruno intenta devolverla | 1: `409` «La entrega no puede pasar a ese estado: los estados van en orden.». 2: `403` y `409` «Con rider, la entrega la marca el rider con tu código.». 3: `409` «Solo puedes marcar «He devuelto el objeto» con el alquiler en curso.». La entrega sigue «Asignada» | `seguimiento-entrega.spec.ts` · API |
| CP-SEG-04 | 1 y 2. El rider avanza y los demás lo ven sin recargar | bruno y ana con el seguimiento abierto; sesión de dani | 1. dani pulsa «Marcar como Recogida» 2. Pulsa «Marcar como En camino» | Cada paso queda como estado actual con su hora, y bruno y ana lo ven en menos de 10 s sin recargar. Solo bruno ve el código | `seguimiento-entrega.spec.ts` · con rider |
| CP-SEG-05 | 3. Marcar «Entregada» exige el código correcto | Entrega «En camino» | 1. dani escribe `123` 2. Un código de 6 cifras incorrecto 3. El código que ve bruno | 1: «Escribe las 6 cifras del código de entrega.». 2: «El código no es correcto. Te quedan 4 intentos.» y sigue «En camino». 3: pasa a «En curso», bruno lo ve sin recargar y deja de ver el código. Repetir el código da `409` | `seguimiento-entrega.spec.ts` · código |
| CP-SEG-06 | 5. Devolver el objeto | Hidrolimpiadora «En curso»; sesión de bruno | 1. «He devuelto el objeto» › «Sí, lo he devuelto» | Sale «Alquiler finalizado.», «Finalizada» con su hora y la tarjeta de «Mis solicitudes» en «Finalizada» | `seguimiento-entrega.spec.ts` · devolución |
| CP-SEG-07 | 4. Sin rider: «Ya tengo el objeto» | Cortacésped (domicilio); sesión de bruno | 1. «Ya tengo el objeto» › «Cancelar» 2. Otra vez › «Sí, ya lo tengo» 3. «He devuelto el objeto» › «Sí, lo he devuelto» | «He devuelto el objeto» no sale antes de tiempo. 1: no cambia nada. 2: pasa a «En curso». 3: «Alquiler finalizado.» | `seguimiento-entrega.spec.ts` · domicilio |
| CP-SEG-08 | 4 y 2. Punto de recogida | Bicicleta; bruno (propietario) con el seguimiento abierto; sesión de ana | 1. ana pulsa «Ya tengo el objeto» › «Sí, ya lo tengo» | bruno no tiene ese botón; pasa a «En curso» y bruno lo ve sin recargar | `seguimiento-entrega.spec.ts` · punto de recogida |
| — | 5. «Valorar» al finalizar | US-08.01 y US-08.02 en develop | Pendiente: el botón está oculto hasta entonces | **Pendiente** | Cuando entren US-08.01 y US-08.02 |

### US-11.03 Aceptar o rechazar solicitudes de rider (#305) · S2-T39 (#319)

Datos del seed: `admin@rentit.test` es el admin; carla tiene la solicitud pendiente, dani es rider aceptado y eva está rechazada con el motivo «Zona sin cobertura de reparto por ahora.». carla no se toca, porque `hazte-rider.spec.ts` la necesita pendiente: los casos que aceptan o rechazan crean antes su propio rider con datos únicos (`POST /api/riders`), y CP-ADM-07 crea su propio objeto. Por eso estos e2e se pueden repetir sin volver a cargar el seed.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-ADM-01 | 1. Solo el admin | Sesiones de ana y del admin | 1. ana abre `/admin/solicitudes` 2. `GET /api/admin/riders` con el token de ana y sin token 3. Entrar como admin | ana no ve «Panel» y vuelve al inicio; la API responde `403` y `401`. El admin entra directamente en `/admin`, con «Resumen», «Objetos», «Riders activos» y «Solicitudes» | `admin-riders.spec.ts` · criterio 1 |
| CP-ADM-02 | 2. Pendientes con el cuestionario | Rider nuevo pendiente | 1. «Solicitudes» 2. Desplegar la del rider nuevo | Filtro «Pendientes» marcado; carla (la más antigua) sale antes que el rider nuevo, con su zona, «Bici», la fecha y «Pendiente de revisión». Al desplegar: correo, teléfono, zona, vehículo, días, franjas, cuándo aceptó las condiciones, «Aceptar» y «Rechazar» | `admin-riders.spec.ts` · criterio 2 |
| CP-ADM-03 | 3 y 5. Aceptar | Rider nuevo pendiente | 1. «Aceptar» 2. Filtro «Aceptadas» 3. «Riders activos» | «Has aceptado a <nombre>: ya puede hacer entregas.»; sale de «Pendientes» y en «Aceptadas» pone «Aceptada el … por admin». Su cuenta pasa a `riderStatus: approved` y sale en «Riders activos» con su zona, junto a dani | `admin-riders.spec.ts` · aceptar |
| CP-ADM-04 | 3. Rechazar con motivo | Rider nuevo pendiente | 1. «Rechazar» 2. Escribir el motivo › «Rechazar solicitud» 3. Filtro «Rechazadas» 4. Entrar con esa cuenta | «Has rechazado la solicitud de <nombre>.»; en «Rechazadas», «Motivo: …» y «Rechazada el … por admin». La persona ve «Solicitud rechazada» y su motivo | `admin-riders.spec.ts` · rechazar |
| CP-ADM-05 | 3. El motivo del seed | Sesión de eva | 1. Iniciar sesión | Ve «Solicitud rechazada» y «Motivo: Zona sin cobertura de reparto por ahora.», sin «Trabajos» (cierra CP-RID-12) | `admin-riders.spec.ts` · eva |
| CP-ADM-06 | 4. Ya revisada | Rider nuevo pendiente, desplegado en el panel | 1. Otro admin la acepta por la API 2. Pulsar «Aceptar» en el panel 3. Volver a aceptarla o rechazarla por la API | Sale «Esta solicitud ya se ha revisado.» y desaparece de «Pendientes». La API responde `409` con ese mensaje en los dos casos | `admin-riders.spec.ts` · criterio 4 |
| CP-ADM-07 | 6. Retirar un objeto con motivo | Objeto nuevo de ana (creado por la API) | 1. «Objetos» › buscarlo › «Retirar» 2. «Anuncio falso o engañoso» y detalles › «Retirar anuncio» 3. ana abre «Mis objetos» | ««<objeto>» se ha retirado de Rentit.» y ya no sale en la lista; ana ve «Rentit ha retirado este anuncio. Motivo: Anuncio falso o engañoso. <detalles>» | `admin-riders.spec.ts` · criterio 6 |
| CP-ADM-08 | Sin pendientes | La lista simulada vacía (carla siempre está pendiente en el seed) | 1. «Solicitudes» | «Pendientes · 0» y «No hay solicitudes pendientes.» | `admin-riders.spec.ts` · sin pendientes |

### US-10.01 Rider acepta entregas disponibles (#78) · S2-T19 (#294)

Datos del seed para los e2e: dos trabajos disponibles de ana, solicitados por vecino5 y vecino6, pagados, con rider y sin rider asignado: la «Máquina de coser Singer» (Sants → Gràcia, «Lo antes posible», mañana) y la «Barbacoa de carbón portátil» (Les Corts → Poblenou, 17:00-19:00, pasado mañana). Riders aceptados: `dani@rentit.test` y `oscar@rentit.test` (para «dos riders aceptan el mismo»); `carla@rentit.test` sigue pendiente. La «Hidrolimpiadora Kärcher» ya es de dani y sale en su «Mis trabajos». Aceptar cambia la BD: antes de repetir los casos hay que volver a ejecutar `npm run db:seed`. Los casos CP los añade T19; los de la API están en `backend/tests/api/riderJobs.test.ts`.

## 5. Métricas de tests

Petición del profesor en la demo del Sprint 1 (#272). Las dos métricas salen solas del CI y de GitHub; solo hace falta seguir las reglas de `AGENTS.md`.

### Cobertura de código

Qué porcentaje del código ejecutan los tests unitarios y de API (diapositiva 8 de «QA: Review, Testing, Code Analysis»). La mide Vitest con `@vitest/coverage-v8`.

- **En local:** `npm run test:coverage` en `backend/` o `frontend/`. Al final sale el resumen, y el detalle por archivo (qué líneas no se ejecutan) en `coverage/index.html`.
- **En el CI:** los jobs Backend y Frontend ejecutan `npm run test:coverage`. El job «Cobertura» pone la tabla en el resumen de la ejecución y en un comentario del PR, que se actualiza en cada push.
- **Mínimos** (`thresholds` en cada `vitest.config.ts`): el valor medido el 5/11/2026 menos 2 puntos. Si baja de ahí, el CI falla. Los mínimos **solo se suben** (lo hace QA al final de cada sprint), nunca se bajan.
- **Cobertura no es calidad:** un test sin comprobaciones también cuenta como cubierto (diapositiva 19). Por eso siguen valiendo las reglas de la sección 3 («Qué comprobar»).
- Los e2e no entran en la cobertura: comprueban los criterios de aceptación (sección 4), no líneas de código.

| Fecha | Parte | Líneas | Sentencias | Funciones | Ramas |
|---|---|---|---|---|---|
| 5/11/2026 | backend | 92,7 % | 92,7 % | 95,8 % | 93,8 % |
| 5/11/2026 | frontend | 95,7 % | 93,6 % | 96,2 % | 89,7 % |

### Bugs encontrados por tests

Cuántos bugs encuentran los tests frente a los que se encuentran a mano, en revisión o en producción.

1. Un **bug** es un fallo en código ya integrado (rama de historia, `develop` o `main`). Lo que falla durante tu propia tarea, antes de integrarla, no cuenta.
2. Todo bug se abre con la plantilla **«Bug»** (Issues → New issue → Bug), que pregunta **«¿Cómo se ha encontrado?»**.
3. El workflow «Métricas de tests» pone la etiqueta según la respuesta, cada lunes o cuando se lanza a mano (así no hay una ejecución en Actions por cada issue):

| Respuesta | Etiqueta |
|---|---|
| Un test automático en local (unitario, de API o e2e) | `hallado-por-test` |
| El CI de un PR | `hallado-por-ci` |
| Revisión de código | `hallado-en-revision` |
| Probando a mano | `hallado-a-mano` |
| En producción o en la demo | `hallado-en-produccion` |
| Sin responder | `hallado-sin-indicar` |

4. El arreglo va en `bugfix/US-XX.YY-<nº>-<desc>` (o `hotfix/US-XX.YY-<nº>-<desc>` si ya está en `main`), con el código de la historia afectada, con `Closes #<nº>` y **el test que reproduce el bug**. El check «Test del arreglo» falla si falta alguna de las dos cosas. Así cada bug deja un test que impide que vuelva.
5. Además, el informe cuenta las ejecuciones del CI en PRs en las que falló un paso de tests: son fallos que el CI paró antes de integrarlos.

### Informe para la demo

Actions → **«Métricas de tests»** → *Run workflow* (también se ejecuta cada lunes). El resumen de la ejecución tiene la cobertura de `develop`, la tabla de bugs por sprint y origen, la lista de bugs encontrados por tests y los fallos parados por el CI. Es lo que se enseña en la demo y lo que se copia a la plantilla del sprint.

En local: `node .github/scripts/bugs.mjs informe` (con `gh` autenticado).

## 6. Pendiente

- **Smoke test en el CI:** el workflow de GitHub Actions que arranca PostgreSQL, el backend y el frontend y ejecuta `npm run test:smoke`. Se coordina con el CI general (#19, Kai). En el CI conviene servir el frontend compilado (`npm run build` + `npm run preview`) en lugar de `npm run dev`, para evitar la espera de la primera carga de Vite.
- **E2E del perfil:** «Mi perfil» es el perfil público propio (US-01.4, `/usuarios/:id`; `/perfil` redirige a él). Tiene tests unitarios, pero aún no un test e2e propio de editar la foto y la bio (el perfil está cubierto indirectamente por el criterio 2 del login y el 5 del logout).
