# ADR 0003 · Mapas, geocodificación y distancias

- **Estado:** Propuesto (pendiente de revisión del equipo)
- **Fecha:** 31/10/2026
- **Responsable:** Francesc (spike SP-02, #91)
- **Relacionado:** [ADR 0001](0001-stack.md), [`docs/modelo-datos.md`](../modelo-datos.md) (`objeto.barrio`, `objeto.latitud`, `objeto.longitud`, `punto_recogida`), prototipo en [`spikes/sp02-mapas/`](../../spikes/sp02-mapas/)

> Generado con asistencia de IA (Claude) – revisado por <Francesc>, <31/10/2026>.

## Contexto

Necesitamos mapas y distancias en estas historias (en el spike se citaban como US-17 y US-08, de la numeración antigua):

- **US-03.04 Buscar en mapa y por distancia (#59):** enseñar los objetos en un mapa y filtrarlos por cercanía.
- **US-05.01 Elegir modo y hora de entrega (#66):** la **tarifa del rider** depende de la distancia entre el propietario y el arrendatario.
- **US-02.01 Publicar un objeto (#13, #14):** hay que convertir la dirección del propietario en coordenadas (`objeto.latitud` y `objeto.longitud`) y en `objeto.barrio`.

La pregunta del spike: **¿Leaflet + OpenStreetMap o Google Maps? ¿Cómo geocodificamos direcciones y calculamos distancias para la tarifa del rider sin coste?** Requisitos: coste cero, sin tarjeta si es posible y que encaje con React 19 en Vercel y el backend en Render (ADR 0001).

## Opciones

### Mapa

| Opción | Coste (octubre de 2026) | A favor | En contra |
|---|---|---|---|
| **Leaflet + teselas de OpenStreetMap** | Gratis, sin cuenta ni clave. | Librería pequeña y muy conocida (1.9.4 es la estable; 2.0 sigue en alfa). Los datos de OSM son buenos en Barcelona. Se puede cambiar de proveedor de teselas cambiando una URL. | Las teselas de `tile.openstreetmap.org` no tienen garantía de servicio y su política prohíbe el uso intensivo. La atribución tiene que verse siempre. |
| **Google Maps Platform** | Desde marzo de 2025 no hay crédito de 200 $: cada producto tiene su propia cuota gratuita mensual (según fuentes de terceros, unas 10 000 cargas de mapa dinámico y 10 000 geocodificaciones al mes). **Pide una cuenta de facturación con tarjeta.** | Mapas y geocodificación muy precisos, con autocompletado de direcciones. | Tarjeta obligatoria y riesgo de pagar si se pasa la cuota. Una clave de API más que proteger. El código queda atado a Google. |

### Geocodificación (de dirección a coordenadas)

| Opción | A favor | En contra |
|---|---|---|
| **Nominatim (OpenStreetMap)** | Gratis y sin clave. Devuelve también el **barrio** (`neighbourhood` / `quarter` / `suburb`), con lo que se rellena `objeto.barrio` sin preguntarlo. | Como mucho **1 petición por segundo** en total, **sin autocompletar** y con caché obligatoria. Hay que identificarse con un User-Agent propio. |
| **Geocoding de Google** | Más tolerante con direcciones mal escritas. | Las mismas pegas que Google Maps. |

### Distancia

| Opción | A favor | En contra |
|---|---|---|
| **Línea recta (Haversine)** | Una función de 10 líneas sin dependencias ni servicios externos. Se puede calcular también en SQL. | No es la distancia que se recorre. |
| **Ruta real (OSRM u otro servicio)** | Distancia exacta por calle. | El servidor público de OSRM es solo para uso ligero no comercial y sin garantía. Montar uno propio no cabe en el plan gratuito. |

## Decisión

1. **Mapa con Leaflet 1.9.4 y teselas de OpenStreetMap.**
   - En el frontend, `leaflet` y `@types/leaflet`, con un componente propio que crea el mapa en un `useEffect`. `react-leaflet` 5 (compatible con React 19) es opcional: si se quiere, se decide en equipo, porque cada dependencia nueva hay que acordarla (AGENTS.md).
   - La URL de las teselas va en una variable `VITE_MAP_TILE_URL`, con la de OSM por defecto. Si OSM nos limita, se cambia de proveedor sin tocar el código.
   - La atribución «© OpenStreetMap» se ve siempre.
2. **Geocodificación con Nominatim, desde el backend y una sola vez.**
   - Se geocodifica al **publicar** o al **cambiar la dirección** de un objeto, nunca al enseñar un mapa ni al buscar. Las coordenadas y el barrio se guardan en `objeto.latitud`, `objeto.longitud` y `objeto.barrio`: la propia BD es la caché.
   - El formulario pide la dirección completa y la geocodifica al enviarlo, sin autocompletar.
   - El backend manda un User-Agent propio (`Rentit/1.0 (+URL del repo)`) y no hace más de una petición por segundo.
   - La URL de Nominatim va en `backend/src/config/` para poder apagarlo o cambiarlo de proveedor sin desplegar código.
   - Si Nominatim no encuentra la dirección, el formulario devuelve un error en el campo: `{ "error": "No encontramos esa dirección, revísala.", "field": "address" }`.
3. **Distancias con Haversine** (`distanceKm` de [`geo.mjs`](../../spikes/sp02-mapas/geo.mjs), que se pasa a `backend/src/services/`).
   - **Tarifa del rider:** distancia en línea recta × **1,3** (factor medido con OSRM en Barcelona: de media, la ruta en bici es un 30 % más larga; ver el [README del prototipo](../../spikes/sp02-mapas/README.md)). Los importes (base y precio por km) los decide el equipo en US-05.01; el prototipo usa 2 € + 0,80 €/km solo como ejemplo.
   - **No usamos el OSRM público en producción.**
4. **Búsqueda por distancia (US-03.04) en PostgreSQL, sin extensiones.**
   - Primero se prefiltra con una caja (`latitud BETWEEN … AND longitud BETWEEN …`, calculada con `boundingBox`) y un índice sobre `(latitud, longitud)`, y después se ordena por la distancia de Haversine en SQL (`$queryRaw` de Prisma, en el repositorio).
   - Con pocos miles de objetos es de sobra. Si algún día hace falta más, Supabase permite activar **PostGIS**; sería una migración nueva.
5. **Privacidad: la ubicación exacta no sale nunca del backend** (salvo al propietario).
   - La API devuelve a los demás usuarios una **ubicación aproximada**: el centro de una celda de 0,005° (`approximateLocation`), unos 550 × 420 m en Barcelona. Todos los objetos de la misma celda caen en el mismo punto, así que no se puede deducir el portal.
   - El mapa dibuja la zona, no un pin exacto.
   - La búsqueda por distancia filtra con la ubicación aproximada, para que el resultado no delate la exacta.
   - La dirección exacta solo se comparte con el rider y el arrendatario cuando la reserva está **aceptada** (US-05).
   - Los `punto_recogida` son lugares públicos: esos sí van con sus coordenadas exactas.

## Consecuencias

- **Coste cero y sin tarjeta.** Ninguna cuenta ni clave nueva.
- **Dependencias nuevas** cuando se implemente US-03.04: `leaflet` y `@types/leaflet` en `frontend/` (y `react-leaflet` si se acuerda). En el backend, ninguna: `fetch` a Nominatim y Haversine a mano.
- **Variables nuevas** en `.env.example`: `VITE_MAP_TILE_URL` (frontend) y `GEOCODER_URL` (backend), con los valores públicos de OSM.
- **Riesgos:**
  - OSM o Nominatim pueden limitarnos sin aviso. Con nuestro tráfico es poco probable; si pasa, se cambia de proveedor con las variables.
  - La tarifa por línea recta × 1,3 se equivoca en trayectos con obstáculos (el mar, las vías, la Diagonal); en la medición, el peor caso fue +53 %. Para una tarifa orientativa basta.
  - Nominatim no siempre encuentra direcciones mal escritas. El formulario tiene que decir claramente qué falla.
- **Pendiente:**
  - Que el equipo decida los importes de la tarifa del rider (US-05.01).
  - Añadir la dirección al formulario de publicar (#13, #14): el modelo no tiene columna de dirección, y está bien así si solo guardamos las coordenadas y el barrio. La dirección exacta para la entrega se pediría al aceptar la reserva.
