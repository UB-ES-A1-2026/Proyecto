// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
import { describe, expect, it } from 'vitest';
import {
  calculateTotalPrice,
  countRentalDays,
  formatInputDate,
  formatLongDate,
  formatPrice,
  maskInputDate,
  parseInputDate,
  todayIso,
  validateInputDates,
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

  it('da la fecha de hoy en España en formato AAAA-MM-DD', () => {
    expect(todayIso(new Date('2026-01-05T22:30:00Z'))).toBe('2026-01-05');
    // A las 23:30 UTC, en España ya es el día siguiente
    expect(todayIso(new Date('2026-01-05T23:30:00Z'))).toBe('2026-01-06');
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

describe('campos de fecha en formato dd/mm/aaaa', () => {
  it('convierte entre el texto y la fecha de la API', () => {
    expect(formatInputDate('2030-03-10')).toBe('10/03/2030');
    expect(formatInputDate('')).toBe('');
    expect(parseInputDate('10/03/2030')).toBe('2030-03-10');
    expect(parseInputDate('1/3/2030')).toBe('2030-03-01');
  });

  it('no da fecha si está a medias o no existe', () => {
    expect(parseInputDate('')).toBe('');
    expect(parseInputDate('10/03')).toBe('');
    expect(parseInputDate('10/03/203')).toBe('');
    expect(parseInputDate('31/02/2030')).toBe('');
    expect(parseInputDate('10/13/2030')).toBe('');
    expect(parseInputDate('29/02/2028')).toBe('2028-02-29');
  });

  it('solo da error con la fecha completa', () => {
    expect(validateInputDates('', '10/0')).toEqual({});
    expect(validateInputDates('10/03/2030', '12/03/2030')).toEqual({});
    expect(validateInputDates('31/02/2030', '31/04/2030')).toEqual({
      startDate: 'Esa fecha no existe.',
      endDate: 'Esa fecha no existe.',
    });
  });

  it('pone las barras mientras se escribe, sin impedir borrarlas', () => {
    expect(maskInputDate('10032030')).toBe('10/03/2030');
    expect(maskInputDate('100')).toBe('10/0');
    expect(maskInputDate('10')).toBe('10');
    expect(maskInputDate('10/')).toBe('10/');
    expect(maskInputDate('1/3/2030')).toBe('1/3/2030');
    expect(maskInputDate('10-03-2030')).toBe('10/03/2030');
    expect(maskInputDate('10/03/20301')).toBe('10/03/2030');
    expect(maskInputDate('ab1')).toBe('1');
  });
});
