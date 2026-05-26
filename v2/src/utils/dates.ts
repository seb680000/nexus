export function parseDate(value: string) {
  if (!value || value === 'Totals') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function frDate(date: Date | null) {
  return date
    ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '-';
}

export function frTime(date: Date | null) {
  return date
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '-';
}

export function frDateHour(date: Date | null) {
  return date ? `${frDate(date)} ${frTime(date).replace(':', 'h')}` : '-';
}

export function frDateTime(date: Date | null) {
  return date
    ? `${frDate(date)} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : '-';
}

export function dayKey(date: Date | null) {
  if (!date) return 'inconnu';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function periodLabel(label: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const [year, month, day] = label.split('-');
    return `${day}/${month}/${year.slice(2)}`;
  }
  if (/^\d{4}-\d{2}$/.test(label)) {
    const [year, month] = label.split('-');
    return `${month}/${year.slice(2)}`;
  }
  return label;
}

export function inBusinessHours(date: Date | null) {
  if (!date) return false;
  const hour = date.getHours() + date.getMinutes() / 60;
  return hour >= 8 && hour < 18;
}

export function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day);
  return copy;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
