// Generado con asistencia de IA (Claude) – revisado por <nombre>, <fecha>
// Prototipo del spike SP-02 (#91). No es código de producción: todo vive en el navegador
// para poder probarlo sin backend. En Rentit, geocodificar y calcular la tarifa irían en el
// backend (ver ADR 0003).
import { APPROXIMATE_CELL_DEGREES, approximateLocation, distanceKm, riderFee } from './geo.mjs';

const formatKm = (km) => `${km.toLocaleString('es-ES', { maximumFractionDigits: 2 })} km`;
const formatEuros = (euros) =>
  euros.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/* global L */

const BARCELONA = [41.395, 2.165];

// Objetos de ejemplo con su ubicación EXACTA (la que guardaría la BD). El mapa nunca la enseña.
const ITEMS = [
  { title: 'Taladro percutor', price: 5.5, barrio: 'Gràcia', lat: 41.40327, lng: 2.15755 },
  { title: 'Escalera de 3 tramos', price: 8, barrio: 'Gràcia', lat: 41.40011, lng: 2.15392 },
  { title: 'Tienda de campaña 4 plazas', price: 12, barrio: 'Sants', lat: 41.37601, lng: 2.13512 },
  { title: 'Proyector Full HD', price: 15, barrio: 'Poblenou', lat: 41.40102, lng: 2.20231 },
  { title: 'Bicicleta de paseo', price: 9, barrio: 'Eixample', lat: 41.39188, lng: 2.16496 },
  { title: 'Máquina de coser', price: 6, barrio: 'Sant Andreu', lat: 41.43391, lng: 2.18877 },
];

const map = L.map('map').setView(BARCELONA, 13);

// Teselas de OpenStreetMap: la atribución es obligatoria y tiene que verse siempre.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// --- Objetos en su ubicación aproximada -----------------------------------------------------

const half = APPROXIMATE_CELL_DEGREES / 2;
const itemsOnMap = ITEMS.map((item) => {
  const approx = approximateLocation(item);
  // La celda entera se dibuja para que se vea que la ubicación es una zona, no un portal.
  L.rectangle(
    [
      [approx.lat - half, approx.lng - half],
      [approx.lat + half, approx.lng + half],
    ],
    { color: '#2563eb', weight: 1, fillOpacity: 0.08, interactive: false },
  ).addTo(map);
  const withApprox = { ...item, approx };
  withApprox.marker = L.marker([approx.lat, approx.lng])
    .addTo(map)
    .bindPopup(() => itemPopup(withApprox));
  return withApprox;
});

// --- Geocodificación con Nominatim ----------------------------------------------------------

// Política de Nominatim: como máximo 1 petición por segundo, sin autocompletar y guardando
// en caché los resultados. Aquí la caché es un Map en memoria; en el backend, la propia BD.
const geocodeCache = new Map();
let lastGeocodeAt = 0;

async function geocode(address) {
  const key = address.trim().toLowerCase();
  if (geocodeCache.has(key)) return { ...geocodeCache.get(key), cached: true };

  const wait = 1000 - (Date.now() - lastGeocodeAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastGeocodeAt = Date.now();

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q: address,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'es',
    addressdetails: '1',
  }).toString();
  // El navegador ya manda el Referer, que es lo que pide la política. Desde el backend habría
  // que mandar un User-Agent propio (p. ej. «Rentit/1.0 (contacto)»).
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nominatim respondió ${response.status}`);
  const [first] = await response.json();
  if (!first) return null;

  const { address: parts } = first;
  const result = {
    lat: Number(first.lat),
    lng: Number(first.lon),
    // El barrio sale del propio resultado: así se rellenaría objeto.barrio sin preguntarlo.
    barrio: parts.neighbourhood ?? parts.quarter ?? parts.suburb ?? parts.city_district ?? '—',
  };
  geocodeCache.set(key, result);
  return result;
}

// --- Puntos A (recogida) y B (entrega) ------------------------------------------------------

const POINTS = {
  A: { name: 'la recogida (A)', color: '#15803d', marker: null, info: null },
  B: { name: 'la entrega (B)', color: '#dc2626', marker: null, info: null },
};
const mapElement = document.getElementById('map');
const mapHint = document.getElementById('map-hint');
// Punto que se colocará con el próximo clic en el mapa (null: ninguno).
let placing = null;
let straightLine = null;
let routeLine = null;

function setPlacing(key) {
  placing = key;
  mapElement.classList.toggle('is-placing', Boolean(key));
  for (const other of Object.keys(POINTS)) {
    document.getElementById(`card-${other}`).classList.toggle('is-placing', other === key);
  }
  updateHint();
}

function updateHint() {
  let text = '';
  if (placing) {
    text = `Haz clic en el mapa para colocar ${POINTS[placing].name} · Esc para cancelar`;
  } else if (POINTS.A.marker && POINTS.B.marker) {
    text = 'Arrastra A o B para moverlos';
  }
  mapHint.textContent = text;
  mapHint.hidden = !text;
}

const position = (key) => {
  const latlng = POINTS[key].marker?.getLatLng();
  return latlng ? { lat: latlng.lat, lng: latlng.lng } : null;
};

// Coloca (o mueve) un punto. `info` es el texto que se enseña en su tarjeta.
function setPoint(key, latlng, info = 'Colocado en el mapa.') {
  const point = POINTS[key];
  point.info = info;
  if (point.marker) {
    point.marker.setLatLng(latlng);
  } else {
    point.marker = L.marker(latlng, {
      draggable: true,
      title: `Arrastra para mover ${point.name}`,
      icon: L.divIcon({
        className: '',
        html: `<div class="point-icon" style="background:${point.color}">${key}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).addTo(map);
    point.marker.on('drag', () => {
      drawStraightLine();
      showDistance();
    });
    point.marker.on('dragend', () => {
      point.info = 'Movido en el mapa.';
      update();
    });
  }
  // Después de colocar uno, si el otro aún falta, el siguiente clic lo coloca.
  const missing = Object.keys(POINTS).find((other) => other !== key && !POINTS[other].marker);
  setPlacing(missing ?? null);
  update();
}

function removePoint(key) {
  POINTS[key].marker?.remove();
  POINTS[key].marker = null;
  POINTS[key].info = null;
  setPlacing(key);
  update();
}

map.on('click', (event) => {
  if (placing) setPoint(placing, event.latlng);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setPlacing(null);
});

for (const button of document.querySelectorAll('.place-button')) {
  button.addEventListener('click', () => {
    const key = button.dataset.point;
    setPlacing(placing === key ? null : key);
  });
}
for (const button of document.querySelectorAll('.remove-button')) {
  button.addEventListener('click', () => removePoint(button.dataset.point));
}

// Buscar una dirección y colocar con ella A o B.
for (const form of document.querySelectorAll('.address-form')) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const key = form.dataset.point;
    const status = document.getElementById(`status-${key}`);
    const address = form.querySelector('input').value;
    if (!address.trim()) return;
    status.textContent = 'Buscando…';
    try {
      const result = await geocode(address);
      if (!result) {
        status.textContent = 'No se ha encontrado la dirección. Revísala o colócala en el mapa.';
        return;
      }
      const approx = approximateLocation(result);
      setPoint(
        key,
        [result.lat, result.lng],
        [
          `Barrio: ${result.barrio}${result.cached ? ' (desde la caché)' : ''}`,
          `Exacta, solo para la BD: ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`,
          `Aproximada, la pública: ${approx.lat}, ${approx.lng}`,
        ].join('\n'),
      );
      map.flyTo([result.lat, result.lng], Math.max(map.getZoom(), 14));
    } catch (error) {
      status.textContent = `Error al buscar: ${error.message}`;
    }
  });
}

// --- Distancia y tarifa ---------------------------------------------------------------------

const distanceResult = document.getElementById('distance-result');
const routeButton = document.getElementById('route-button');

function drawStraightLine() {
  const a = position('A');
  const b = position('B');
  straightLine?.remove();
  straightLine = null;
  // Si se mueve un punto, la ruta calculada ya no vale.
  routeLine?.remove();
  routeLine = null;
  if (a && b) {
    straightLine = L.polyline([a, b], {
      color: '#2563eb',
      dashArray: '6 6',
      interactive: false,
    }).addTo(map);
  }
}

function showDistance() {
  const a = position('A');
  const b = position('B');
  distanceResult.innerHTML = '';
  routeButton.disabled = !(a && b);
  if (!a || !b) {
    distanceResult.textContent = 'Coloca A y B para ver la distancia y la tarifa.';
    return;
  }
  const km = distanceKm(a, b);
  const fee = document.createElement('strong');
  fee.textContent = `Tarifa del rider: ${formatEuros(riderFee(km))}`;
  distanceResult.append(
    fee,
    textLine(`En línea recta: ${formatKm(km)}`),
    textLine(`Estimada por calle (× 1,3): ${formatKm(km * 1.3)}`),
    textLine('Tarifa de ejemplo: 2 € + 0,80 € por km por calle.'),
  );
}

// Ruta real en bici con el servidor público de OSRM de FOSSGIS: solo para comparar en el
// prototipo. Su política lo limita a uso ligero no comercial (1 petición/s, sin garantías).
routeButton.addEventListener('click', async () => {
  const a = position('A');
  const b = position('B');
  routeButton.disabled = true;
  try {
    const url = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    const [route] = data.routes;
    const roadKm = route.distance / 1000;
    const factor = (roadKm / distanceKm(a, b)).toFixed(2).replace('.', ',');
    routeLine?.remove();
    routeLine = L.geoJSON(route.geometry, {
      style: { color: '#7c3aed', weight: 5, opacity: 0.8 },
      interactive: false,
    }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    distanceResult.append(
      textLine(`Ruta real en bici (en lila): ${formatKm(roadKm)}, ${factor} veces la línea recta`),
    );
  } catch (error) {
    distanceResult.append(textLine(`OSRM no responde: ${error.message}`));
  }
});

// --- Objetos a menos de X km de A (lo que haría la búsqueda de US-03.04) -------------------

const radiusInput = document.getElementById('radius');
const nearbyList = document.getElementById('nearby');
let radiusCircle = null;

function updateNearby() {
  const radiusKm = Number(radiusInput.value);
  document.getElementById('radius-value').textContent = String(radiusKm).replace('.', ',');
  radiusCircle?.remove();
  radiusCircle = null;
  nearbyList.innerHTML = '';
  const center = position('A');
  if (!center) {
    nearbyList.append(textLine('Coloca la recogida (A) para ver qué objetos tiene cerca.'));
    return;
  }
  radiusCircle = L.circle(center, {
    radius: radiusKm * 1000,
    color: '#15803d',
    fillOpacity: 0.05,
    // Las formas no capturan los clics: así se puede colocar B dentro del círculo.
    interactive: false,
  }).addTo(map);

  // Se mide con la ubicación aproximada, igual que vería cualquier usuario.
  const nearby = itemsOnMap
    .map((item) => ({ ...item, km: distanceKm(center, item.approx) }))
    .filter((item) => item.km <= radiusKm)
    .sort((x, y) => x.km - y.km);
  if (nearby.length === 0) nearbyList.append(textLine('Ningún objeto en este radio.'));
  for (const item of nearby) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nearby-item';
    button.textContent = `${item.title} (${item.barrio}) · ${formatKm(item.km)}`;
    button.addEventListener('click', () => {
      map.flyTo(item.approx, 15);
      item.marker.openPopup();
    });
    const li = document.createElement('li');
    li.append(button);
    nearbyList.append(li);
  }
}

radiusInput.addEventListener('input', updateNearby);

// --- Pintar todo ----------------------------------------------------------------------------

function update() {
  for (const key of Object.keys(POINTS)) {
    const placed = Boolean(POINTS[key].marker);
    document.getElementById(`status-${key}`).textContent = POINTS[key].info ?? 'Sin colocar.';
    document.querySelector(`.remove-button[data-point="${key}"]`).hidden = !placed;
    document.querySelector(`.place-button[data-point="${key}"]`).textContent = placed
      ? 'Volver a colocar'
      : 'Colocar en el mapa';
  }
  drawStraightLine();
  showDistance();
  updateNearby();
  updateHint();
}

// textContent en vez de innerHTML: parte del texto viene de servicios externos.
function textLine(text) {
  const element = document.createElement('div');
  element.textContent = text;
  return element;
}

function itemPopup(item) {
  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = item.title;
  const use = document.createElement('button');
  use.type = 'button';
  use.textContent = 'Recoger aquí (A)';
  use.style.marginTop = '0.5rem';
  use.addEventListener('click', () => {
    map.closePopup();
    setPoint('A', [item.approx.lat, item.approx.lng], `Zona de «${item.title}» (${item.barrio}).`);
  });
  content.append(title, textLine(`${formatEuros(item.price)} / día · ${item.barrio}`), use);
  return content;
}

// Al abrir la página, el primer clic en el mapa ya coloca A.
setPlacing('A');
update();
