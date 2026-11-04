// Generado con asistencia de IA (Claude)
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addMonthsToDate,
  endOfWeek,
  formatDayLabel,
  formatMonthLabel,
  monthWeeks,
  selectRangeDate,
  startOfWeek,
} from '../src/utils/calendar';

describe('cálculos del calendario', () => {
  it('suma días y meses cruzando meses y años, también en el cambio de hora', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
  });

  it('al cambiar de mes se queda en el último día si el día no existe', () => {
    expect(addMonthsToDate('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsToDate('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsToDate('2027-03-15', -1)).toBe('2027-02-15');
  });

  it('la semana va de lunes a domingo', () => {
    // El 1 de noviembre de 2026 es domingo.
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26');
    expect(endOfWeek('2026-11-01')).toBe('2026-11-01');
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02');
  });

  it('el mes siempre ocupa 6 semanas, con huecos fuera del mes', () => {
    const weeks = monthWeeks('2026-11');

    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(monthWeeks('2027-02')[0][0]).toBe('2027-02-01');
  });

  it('escribe los días y los meses en español', () => {
    expect(formatDayLabel('2030-03-10')).toBe('10 de marzo de 2030');
    expect(formatMonthLabel('2030-03')).toBe('marzo de 2030');
  });
});

describe('selección del rango', () => {
  const noRange = { startDate: '', endDate: '' };

  it('el primer clic pone el inicio', () => {
    expect(selectRangeDate(noRange, '2030-03-10')).toEqual({
      startDate: '2030-03-10',
      endDate: '',
    });
  });

  it('el segundo clic pone el fin, también en el mismo día', () => {
    const start = { startDate: '2030-03-10', endDate: '' };

    expect(selectRangeDate(start, '2030-03-12').endDate).toBe('2030-03-12');
    expect(selectRangeDate(start, '2030-03-10').endDate).toBe('2030-03-10');
  });

  it('un clic anterior al inicio empieza de nuevo', () => {
    expect(selectRangeDate({ startDate: '2030-03-10', endDate: '' }, '2030-03-05')).toEqual({
      startDate: '2030-03-05',
      endDate: '',
    });
  });

  it('con el rango completo, otro clic empieza uno nuevo', () => {
    expect(
      selectRangeDate({ startDate: '2030-03-10', endDate: '2030-03-12' }, '2030-03-11'),
    ).toEqual({ startDate: '2030-03-11', endDate: '' });
  });

  it('si solo se ha escrito el fin, el clic pone el inicio', () => {
    const end = { startDate: '', endDate: '2030-03-12' };

    expect(selectRangeDate(end, '2030-03-10')).toEqual({
      startDate: '2030-03-10',
      endDate: '2030-03-12',
    });
    expect(selectRangeDate(end, '2030-03-20')).toEqual({
      startDate: '2030-03-20',
      endDate: '',
    });
  });
});
