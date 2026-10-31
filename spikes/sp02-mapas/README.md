# SP-02 · Prototipo de mapa, geocodificación y distancias

Prototipo del spike [#91](https://github.com/UB-ES-A1-2026/Proyecto/issues/91). La decisión y el porqué están en [ADR 0003](../../docs/adr/0003-mapas-geolocalizacion.md). **No es código de producción**: está aislado del frontend y del backend y **no tiene dependencias** (Leaflet se carga desde un CDN con SRI).

## Qué demuestra

1. **Mapa con Leaflet 1.9.4 y teselas de OpenStreetMap**, con la atribución obligatoria visible.
2. **Pines en la ubicación aproximada** de cada objeto: el centro de una celda de 0,005° (~550 × 420 m en Barcelona), dibujada como un rectángulo. La ubicación exacta nunca sale del «servidor».
3. **Geocodificación con Nominatim**: de una dirección a coordenadas y **barrio**, solo al pulsar «Buscar» (sin autocompletar), con caché y como mucho 1 petición por segundo.
4. **Distancia entre dos puntos** (clic en A y en B) con la fórmula de Haversine, la estimación por calle (× 1,3) y una **tarifa del rider de ejemplo**.
5. **Comparación con la ruta real en bici** del servidor público de OSRM (FOSSGIS), solo para medir el factor.
6. **Objetos a menos de X km de A**, que es lo que hará la búsqueda por distancia (US-03.04).

Las funciones de geometría están en [`geo.mjs`](geo.mjs) y tienen tests en [`geo.test.mjs`](geo.test.mjs). Se pueden pasar tal cual a un service del backend.

## Cómo se usa

La página simula una entrega con dos puntos: **A, la recogida** (verde), y **B, la entrega** (rojo).

1. **Colocar A y B.** Al abrir la página, el primer clic en el mapa coloca A y el siguiente, B; un aviso arriba del mapa dice siempre qué hará el próximo clic. También se puede escribir una dirección en la tarjeta de A o de B y pulsar «Buscar», o abrir un objeto del mapa y pulsar «Recoger aquí (A)».
2. **Mover.** A y B se arrastran, y la distancia y la tarifa se actualizan mientras se mueven. «Volver a colocar» deja colocar el punto con un clic; «Quitar» lo borra. Esc cancela.
3. **Ver la ruta real.** «Ver la ruta real en bici (OSRM)» dibuja en lila el recorrido por calle y lo compara con la línea recta.
4. **Objetos cercanos.** La lista de abajo enseña los objetos a menos del radio elegido de A; al pulsar uno, el mapa va hasta él.

## Cómo ejecutarlo

Requisitos: Node 22 y conexión a internet (teselas, Nominatim y OSRM).

```bash
cd spikes/sp02-mapas
npm start      # http://localhost:5180
npm test       # tests de geo.mjs con node:test
```

No hace falta `npm install`.

## Resultados (31/10/2026)

- `npm test`: 8 tests en verde.
- En Chromium (Playwright): 6 pines, sin errores en la consola, atribución «Leaflet | © OpenStreetMap» visible.
- **Geocodificación:** «Carrer de Verdi 10, Barcelona» → `41.40327, 2.15755`, barrio «la Vila de Gràcia». Ubicación pública: `41.4025, 2.1575`, a ~90 m de la exacta. La segunda búsqueda sale de la caché.
- **Factor de la distancia por calle**, medido con OSRM en 6 trayectos de Barcelona:

| Trayecto | Línea recta | Bici | Factor bici | Coche | Factor coche |
|---|---|---|---|---|---|
| Sagrada Família → Camp Nou | 4,99 km | 5,89 km | 1,18 | 5,80 km | 1,16 |
| Pl. Catalunya → Pl. del Sol (Gràcia) | 1,97 km | 2,43 km | 1,23 | 2,58 km | 1,31 |
| Estació de Sants → Rambla del Poblenou | 5,84 km | 7,74 km | 1,32 | 8,29 km | 1,42 |
| Mercat de Sant Andreu → Pl. Catalunya | 5,62 km | 7,33 km | 1,30 | 7,43 km | 1,32 |
| Pl. Major de Sarrià → Pl. del Sol | 2,99 km | 3,64 km | 1,22 | 3,90 km | 1,31 |
| Rambla del Poblenou → Sagrada Família | 2,53 km | 3,89 km | 1,53 | 4,29 km | 1,69 |
| **Media** | | | **1,30** | | **1,37** |

En bici, la ruta real es de media un **30 % más larga** que la línea recta (entre el 18 % y el 53 %). Por eso `ROAD_FACTOR = 1.3`.

## Límites que hay que respetar

- **Teselas de OSM:** atribución siempre visible, nada de descargar zonas enteras ni modo sin conexión, y sin garantía de servicio ([política](https://operations.osmfoundation.org/policies/tiles/)).
- **Nominatim:** como mucho 1 petición por segundo en total, sin autocompletar, con caché y un User-Agent o Referer que identifique la aplicación ([política](https://operations.osmfoundation.org/policies/nominatim/)).
- **OSRM público:** uso ligero y no comercial, 1 petición por segundo, sin garantía ([política](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server)). Solo para este prototipo.
