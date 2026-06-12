export function getISOWeekAndYear(date: Date): { iso_year: number; iso_week: number } {
  const target = new Date(date.valueOf());
  const dayNr = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const iso_week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const iso_year = new Date(firstThursday).getUTCFullYear();
  return { iso_year, iso_week };
}
