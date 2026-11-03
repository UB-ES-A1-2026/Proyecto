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

- **El resultado, no solo la URL.** Tras un login, además de la URL, comprobar que aparece «Cerrar sesión».
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
| CP-LOG-08 | 2. Vuelve a la página en la que estaba (búsqueda, #224) | Sin sesión iniciada | 1. Ir a `/buscar?q=taladro` 2. Pulsar «Iniciar sesión» en la cabecera 3. Iniciar sesión con `ana@rentit.test` / `Rentit2026` | Se vuelve a `/buscar?q=taladro` con la sesión iniciada | `login.spec.ts` · criterio 2 (búsqueda) |

### US-01.3 Cerrar sesión (#47) · T25 (#105)

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-OUT-01 | 1. Hay un botón «Cerrar sesión» | Sesión iniciada como `ana@rentit.test` | 1. Mirar la cabecera | Se ve el botón «Cerrar sesión» | `logout.spec.ts` · criterio 1 |
| CP-OUT-02 | 2. Cerrar sesión redirige y deja de estar autenticado | Sesión iniciada | 1. Pulsar «Cerrar sesión» | Se va a `/login`; la cabecera muestra «Iniciar sesión» y «Crear cuenta» en lugar de «Mi perfil» y «Cerrar sesión» | `logout.spec.ts` · criterio 2 |
| CP-OUT-03 | 3. Las rutas privadas dejan de ser accesibles | Sesión iniciada | 1. Pulsar «Cerrar sesión» 2. Escribir en la barra de direcciones `/perfil` | Se redirige a `/login` | `logout.spec.ts` · criterio 3 |
| CP-OUT-04 | 4. El token anterior deja de ser válido | Sesión iniciada; token copiado (en DevTools › Application › Local Storage › `rentit.session`) | 1. Pulsar «Cerrar sesión» 2. Llamar a `GET /api/usuarios/me` con `Authorization: Bearer <token copiado>` | La API responde `401` | `logout.spec.ts` · criterio 4 |
| CP-OUT-05 | 5. El botón «atrás» no muestra contenido privado | Sesión iniciada | 1. Ir a «Mi perfil» 2. Ir a la página inicial 3. Pulsar «Cerrar sesión» 4. Pulsar «atrás» en el navegador | No se ve el perfil: se redirige a `/login` | `logout.spec.ts` · criterio 5 |

### TR-08 Página de ayuda (#89)

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-AYU-01 | 1. La página `/ayuda` está publicada | Sin sesión iniciada | 1. Ir a `/` 2. Pulsar «Ayuda» en la cabecera | Se abre `/ayuda` con el título «Ayuda» | `ayuda.spec.ts` · criterio 1 |
| CP-AYU-02 | 2. Explica los flujos entregados | — | 1. Ir a `/ayuda` 2. Pulsar cada entrada del índice «En esta página» | Hay una sección con pasos numerados para cada flujo entregado (crear una cuenta, iniciar sesión, ver tu perfil, cerrar sesión, buscar un objeto y ver su ficha), y el índice lleva a cada una | `ayuda.spec.ts` · criterio 2 |
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
| CP-VER-02 | 2. La ficha muestra los datos del objeto | Seed cargado | 1. Abrir la ficha | Se ven la descripción, «6,00 € / día», «Disponible» y las fotos (o «Este objeto no tiene fotos.» si no tiene) | `ver-objeto.spec.ts` · criterio 2 |
| CP-VER-03 | 3. Información pública del propietario | — | 1. Abrir la ficha | Se ve «Publicado por ana» y en la ficha no aparece ningún correo | `ver-objeto.spec.ts` · criterio 3 |
| CP-VER-04 | 4. Botón «Alquilar» | Sesión de bruno | 1. Abrir la ficha 2. Pulsar «Alquilar» | Se va a `/objetos/<id>/solicitar` (US-04.01) | `ver-objeto.spec.ts` · criterio 4a |
| CP-VER-05 | 4. «Alquilar» sin sesión | Sin sesión | 1. Abrir la ficha 2. Pulsar «Alquilar» | Se va a `/login`; tras iniciar sesión se vuelve a la ficha | `ver-objeto.spec.ts` · criterio 4b |
| CP-VER-06 | 4. El propietario no alquila su objeto | Sesión de ana | 1. Abrir la ficha | Se ve «Este anuncio es tuyo.» y no hay botón «Alquilar» | `ver-objeto.spec.ts` · criterio 4c |
| CP-VER-07 | (Errores) Objeto que no existe | — | 1. Ir a `/objetos/00000000-0000-4000-8000-000000000000` | Se ve «No hemos encontrado este objeto» y el enlace «Volver al inicio» | `ver-objeto.spec.ts` · errores |

### US-02.02 Editar un objeto (#51) · S1-T33 (#171)

Se edita la «Hidrolimpiadora Kärcher» de ana (8 €/día, fianza 50 €), que no usa ningún otro e2e. Cada test la deja como estaba al terminar. Del criterio 2, la disponibilidad se cambia con «Pausar» y «Reanudar» en «Mis objetos» (US-02.04), igual que «Disponible ya» o «Pausado» al publicar. Añadir fotos llega cuando entre la subida de US-02.01. Borrar fotos queda para el Sprint 2 (decisión de Marc, 03/11).

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
| CP-MSO-03 | 3. Abrir el detalle | Sesión de ana | 1. Pulsar la solicitud del proyector | Se despliega con el enlace al objeto, «Fechas: Del … al …», «Importe total: 12,00 €», «Estado: Pendiente» y «Propietario: bruno» | `mis-solicitudes.spec.ts` · criterio 3 |
| CP-MSO-04 | 4. Sin solicitudes | Usuario recién registrado | 1. Ir a «Mis solicitudes» | «No tienes solicitudes abiertas» en «Enviadas» y «Todavía no has recibido solicitudes.» en «Recibidas» | `mis-solicitudes.spec.ts` · criterio 4 |
| CP-MSO-05 | (Recibidas) El propietario ve las que le llegan | Sesión de ana | 1. Abrir la solicitud de la escalera en «Recibidas» | Sale «Solicitada por: bruno», y la escalera no aparece en «Enviadas» | `mis-solicitudes.spec.ts` · recibidas |
| CP-MSO-06 | (Acceso) Sin sesión | Sin sesión | 1. Ir a `/mis-solicitudes` | Se redirige a `/login` | `mis-solicitudes.spec.ts` · acceso |

### US-04.01 Solicitar un alquiler (#60) · S1-T21 (#122)

bruno solicita el «Cortacésped eléctrico» de ana (9 €/día). Las fechas son aleatorias, dentro de 1 a 2 años, para poder repetir los tests. La «Escalera de aluminio» de ana tiene en el seed (#210) una solicitud aceptada para dentro de 14 y 15 días, así que esas fechas están ocupadas.

| ID | Criterio | Precondición | Pasos | Resultado esperado | Test e2e |
|---|---|---|---|---|---|
| CP-SOL-01 | 1. Elegir fechas de inicio y fin | Sesión de bruno | 1. Buscar `cortacésped` y abrir la ficha 2. «Alquilar» 3. Elegir inicio y fin | Se va a `/objetos/<id>/solicitar` y quedan las dos fechas elegidas, sin error | `solicitar-alquiler.spec.ts` · criterio 1 |
| CP-SOL-02 | 1. El fin no puede ser anterior al inicio | Como CP-SOL-01 | 1. Elegir un fin anterior al inicio | «La fecha de fin no puede ser anterior a la fecha de inicio.» y «Solicitar alquiler» desactivado | `solicitar-alquiler.spec.ts` · criterio 1 |
| CP-SOL-03 | 2. Se muestra el precio del periodo | Como CP-SOL-01 | 1. Elegir 3 días | «3 días × 9,00 € = 27,00 €» (las dos fechas cuentan) | `solicitar-alquiler.spec.ts` · criterio 2 |
| CP-SOL-04 | 3. Con fechas disponibles se puede solicitar | Como CP-SOL-01 | 1. Fechas libres del cortacésped 2. Fechas de la escalera dentro de 13 y 14 días | En el paso 1, «Solicitar alquiler» está activo. En el 2 sale «El objeto no está disponible en esas fechas.» y el botón está desactivado | `solicitar-alquiler.spec.ts` · criterio 3 |
| CP-SOL-05 | 4. Resumen antes de enviar | Fechas libres | 1. «Solicitar alquiler» | «Revisa tu solicitud» con el objeto, «Desde», «Hasta», «Importe del alquiler (3 días)», 27,00 € y «Confirmar». Todavía no se ha creado ninguna solicitud | `solicitar-alquiler.spec.ts` · criterio 4 |
| CP-SOL-06 | 5. Confirmar crea la solicitud «Pendiente» | CP-SOL-05 | 1. «Confirmar» | Se va a «Mis solicitudes» y en «Enviadas» sale el cortacésped «Pendiente». bruno tiene una solicitud enviada más | `solicitar-alquiler.spec.ts` · criterio 5 |
| CP-SOL-07 | (Permisos) No se puede alquilar un objeto propio | Sesión de ana | 1. Abrir la ficha del cortacésped 2. `POST /api/reservas` con el token de ana | «Este anuncio es tuyo.», sin botón «Alquilar», y la API responde `403` | `solicitar-alquiler.spec.ts` · permisos |

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
| CP-PUB-01 | 1. Se ven los campos del anuncio | Sesión de ana | 1. «Publicar objeto» en la cabecera | Se va a `/objetos/nuevo` y se ven Nombre, Descripción, Fotografías, Precio por día, Disponibilidad y «Publicar» | `publicar-objeto.spec.ts` · criterio 1 |
| CP-PUB-02 | 2. Se puede elegir la categoría | Sesión de ana | 1. Abrir «Categoría» | Están las 8 categorías de la migración y se puede elegir una | `publicar-objeto.spec.ts` · criterio 2 |
| CP-PUB-03 | 3. Publicar con datos válidos | Sesión de ana | 1. Rellenar nombre, descripción, «Herramientas y bricolaje», `7,50`, fianza `20` y «Sants» 2. «Publicar» | Se va a la ficha con esos datos («7,50 € / día», «Fianza: 20,00 €», «Disponible»…) y el objeto sale en la búsqueda | `publicar-objeto.spec.ts` · criterio 3 |
| CP-PUB-04 | 4. El anuncio es de quien lo crea | Sesión de ana | 1. Publicar 2. Abrir la ficha con la sesión de bruno | ana ve «Publicado por ana» y «Este anuncio es tuyo.». bruno ve «Publicado por ana» y el botón «Alquilar» | `publicar-objeto.spec.ts` · criterio 4 |
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
| CP-FIL-01 | 1. Se abren los filtros desde la búsqueda | Página de resultados | 1. Pulsar «Filtros» | Se ven «Categoría», «Precio máximo (€/día)» y «Barrio» | `filtrar-objetos.spec.ts` · criterio 1 |
| CP-FIL-02 | 2-3. Filtrar por categoría | Seed cargado | 1. Elegir «Deporte» 2. «Aplicar filtros» | Solo salen la bicicleta y la tabla de paddle, las dos de «Deporte» | `filtrar-objetos.spec.ts` · criterios 2 y 3 |
| CP-FIL-03 | 2-3. Filtrar por precio máximo | Seed cargado | 1. Precio máximo `4` 2. «Aplicar filtros» | Solo salen objetos de 4 €/día o menos, incluido el de 4 € | `filtrar-objetos.spec.ts` · criterios 2 y 3 |
| CP-FIL-04 | 2-3. Filtrar por ubicación | Seed cargado | 1. Barrio `sant andreu` 2. «Aplicar filtros» | Salen los 4 objetos de Sant Andreu y ninguno de otro barrio | `filtrar-objetos.spec.ts` · criterios 2 y 3 |
| CP-FIL-05 | 4. Varios filtros a la vez | Seed cargado | 1. «Deporte» y precio máximo `10` 2. «Aplicar filtros» 3. Quitar el chip «Hasta 10 €/día» | En el paso 2 solo sale la bicicleta y el botón dice «Filtros (2)». En el 3 vuelve la tabla de paddle y se mantiene la categoría | `filtrar-objetos.spec.ts` · criterio 4 |
| CP-FIL-06 | 5. Limpiar filtros | `/buscar?q=taladro` con precio máximo `2` (sin resultados) | 1. Pulsar «Limpiar filtros» | Se vuelve a `/buscar?q=taladro` y sale otra vez el taladro | `filtrar-objetos.spec.ts` · criterio 5 |
| CP-FIL-07 | (Validación) Precio máximo no válido | — | 1. Precio máximo `-5` 2. «Aplicar filtros» | No cambia la URL. Bajo el campo sale «El campo "precio máximo" no es correcto, revísalo.» | `filtrar-objetos.spec.ts` · validación |

## 5. Pendiente

- **Smoke test en el CI:** el workflow de GitHub Actions que arranca PostgreSQL, el backend y el frontend y ejecuta `npm run test:smoke`. Se coordina con el CI general (#19, Kai). En el CI conviene servir el frontend compilado (`npm run build` + `npm run preview`) en lugar de `npm run dev`, para evitar la espera de la primera carga de Vite.
- **E2E del perfil:** la página «Mi perfil» tiene tests unitarios pero aún no un test e2e propio (está cubierta indirectamente por el criterio 2 del login y el 5 del logout).
