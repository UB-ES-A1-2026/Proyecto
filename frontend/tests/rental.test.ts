// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
import { describe, expect, it } from 'vitest';
import {
  calculateTotalPrice,
  countRentalDays,
  formatLongDate,
  formatPrice,
  todayIso,
  validateRentalDates,
} from '../src/utils/rental';

describe('cálculos del alquiler (US-04.01, #121)', () => {
  it('cuenta el primer y el último día', () => {
    expect(countRentalDays('2026-11-04', '2026-11-06')).toBe(3);
    expect(countRentalDays('2026-11-04', '2026-11-04')).toBe(1);
  });

  it('cuenta bien los días al cambiar de mes y en el cambio de hora', () => {
    expect(countRentalDays('2026-10-30', '2026-11-02')).toBe(4);
    expect(countRentalDays('2027-03-27', '2027-03-29')).toBe(3);
  });

  it('calcula el importe redondeado a céntimos', () => {
    expect(calculateTotalPrice(5, 3)).toBe(15);
    expect(calculateTotalPrice(0.1, 3)).toBe(0.3);
    expect(calculateTotalPrice(12.5, 0)).toBe(0);
  });

  it('da la fecha de hoy en formato AAAA-MM-DD', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('no da error mientras falta alguna fecha', () => {
    expect(validateRentalDates('', '', '2026-11-01')).toEqual({});
    expect(validateRentalDates('2026-11-04', '', '2026-11-01')).toEqual({});
  });

  it('no deja que la fecha de fin sea anterior a la de inicio', () => {
    expect(validateRentalDates('2026-11-06', '2026-11-04', '2026-11-01')).toEqual({
      endDate: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
    });
  });

  it('no deja empezar antes de hoy', () => {
    expect(validateRentalDates('2026-10-31', '2026-11-02', '2026-11-01')).toEqual({
      startDate: 'La fecha de inicio no puede ser anterior a hoy.',
    });
  });

  it('formatea el precio y la fecha en español', () => {
    // Intl separa el símbolo con un espacio no separable (U+00A0) para que no se parta la línea.
    expect(formatPrice(15)).toBe('15,00 €');
    expect(formatLongDate('2026-11-04')).toBe('miércoles, 4 de noviembre de 2026');
  });
});
