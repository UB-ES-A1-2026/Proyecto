import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  APPROXIMATE_CELL_DEGREES,
  approximateLocation,
  boundingBox,
  distanceKm,
  riderFee,
} from './geo.mjs';

const sagradaFamilia = { lat: 41.4036, lng: 2.1744 };
const campNou = { lat: 41.3809, lng: 2.1228 };
const madridSol = { lat: 40.4168, lng: -3.7038 };
const barcelonaPlCatalunya = { lat: 41.387, lng: 2.17 };

describe('distanceKm', () => {
  it('da 0 para el mismo punto y es simétrica', () => {
    assert.equal(distanceKm(sagradaFamilia, sagradaFamilia), 0);
    assert.equal(distanceKm(sagradaFamilia, campNou), distanceKm(campNou, sagradaFamilia));
  });

  it('Sagrada Família – Camp Nou ≈ 5 km en línea recta', () => {
    assert.ok(Math.abs(distanceKm(sagradaFamilia, campNou) - 5) < 0.05);
  });

  it('Barcelona – Madrid ≈ 505 km en línea recta', () => {
    assert.ok(Math.abs(distanceKm(barcelonaPlCatalunya, madridSol) - 505) < 3);
  });
});

describe('approximateLocation', () => {
  it('dos puntos de la misma celda dan la misma ubicación aproximada', () => {
    const a = approximateLocation({ lat: 41.40312, lng: 2.15611 });
    const b = approximateLocation({ lat: 41.40388, lng: 2.15702 });
    assert.deepEqual(a, b);
  });

  it('nunca se aleja más de media diagonal de la celda (≈ 350 m en Barcelona)', () => {
    const exact = { lat: 41.40312, lng: 2.15611 };
    const approx = approximateLocation(exact);
    assert.ok(distanceKm(exact, approx) < 0.35);
    assert.notDeepEqual(approx, exact);
  });

  it('el centro de la celda está a media celda del borde', () => {
    const approx = approximateLocation({ lat: 41.4, lng: 2.15 });
    assert.equal(approx.lat, Number((41.4 + APPROXIMATE_CELL_DEGREES / 2).toFixed(6)));
  });
});

describe('boundingBox', () => {
  it('contiene los puntos a menos del radio y sus bordes están a ese radio', () => {
    const box = boundingBox(sagradaFamilia, 2);
    assert.ok(
      Math.abs(
        distanceKm(sagradaFamilia, {
          lat: box.maxLat,
          lng: sagradaFamilia.lng,
        }) - 2,
      ) < 0.01,
    );
    assert.ok(
      Math.abs(
        distanceKm(sagradaFamilia, {
          lat: sagradaFamilia.lat,
          lng: box.maxLng,
        }) - 2,
      ) < 0.01,
    );
  });
});

describe('riderFee (ejemplo)', () => {
  it('base + precio por km sobre la distancia estimada por calle', () => {
    assert.equal(riderFee(0), 2);
    assert.equal(riderFee(1), 3.04); // 2 + 0,8 × 1 × 1,3
    assert.equal(riderFee(1, { base: 1, perKm: 1, roadFactor: 1 }), 2);
  });
});
