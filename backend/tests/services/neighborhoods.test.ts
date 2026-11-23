// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { describe, expect, it } from 'vitest';
import {
  distanceKm,
  isKnownNeighborhood,
  listNeighborhoods,
  neighborhoodCentre,
  routeDistanceKm,
} from '../../src/services/neighborhoods.js';

describe('neighborhoods', () => {
  it('lists between 30 and 40 neighborhoods, sorted, including the ones the demo uses', () => {
    const list = listNeighborhoods();

    expect(list.length).toBeGreaterThanOrEqual(30);
    expect(list.length).toBeLessThanOrEqual(40);
    expect(list).toEqual(
      [...list].sort((a, b) => new Intl.Collator('es').compare(a, b)),
    );
    expect(list).toEqual(
      expect.arrayContaining(['Gràcia', 'Poblenou', 'Sant Andreu', 'Sants']),
    );
  });

  it('knows a neighborhood only by its exact name', () => {
    expect(isKnownNeighborhood('Gràcia')).toBe(true);
    expect(isKnownNeighborhood('Vila de Gràcia')).toBe(false);
    expect(isKnownNeighborhood('toString')).toBe(false);
    expect(isKnownNeighborhood('')).toBe(false);
  });

  it('gives a centre inside Barcelona for every neighborhood', () => {
    for (const name of listNeighborhoods()) {
      const centre = neighborhoodCentre(name);
      expect(centre, name).toBeDefined();
      expect(centre!.lat).toBeGreaterThan(41.3);
      expect(centre!.lat).toBeLessThan(41.47);
      expect(centre!.lng).toBeGreaterThan(2.05);
      expect(centre!.lng).toBeLessThan(2.23);
    }
    expect(neighborhoodCentre('Madrid')).toBeUndefined();
  });

  it('computes the straight-line distance with Haversine', () => {
    const plazaCatalunya = { lat: 41.387, lng: 2.17 };
    const sagradaFamilia = { lat: 41.4036, lng: 2.1744 };

    expect(distanceKm(plazaCatalunya, plazaCatalunya)).toBe(0);
    expect(distanceKm(plazaCatalunya, sagradaFamilia)).toBeCloseTo(1.87, 1);
  });

  it('multiplies the distance between two neighborhoods by 1.3', () => {
    const from = neighborhoodCentre('Gràcia')!;
    const to = neighborhoodCentre('Poblenou')!;

    expect(routeDistanceKm('Gràcia', 'Poblenou')).toBeCloseTo(
      distanceKm(from, to) * 1.3,
      10,
    );
    expect(routeDistanceKm('Gràcia', 'Gràcia')).toBe(0);
    expect(routeDistanceKm('Gràcia', 'Madrid')).toBeUndefined();
    expect(routeDistanceKm('Madrid', 'Gràcia')).toBeUndefined();
  });
});
