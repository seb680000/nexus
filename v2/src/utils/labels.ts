export function frenchStatus(value: string) {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'answered') return 'Répondu';
  if (normalized === 'unanswered') return 'Non répondu';
  if (normalized === 'abandoned' || normalized === 'abandonne') return 'Abandonné';
  if (normalized === 'waiting') return 'En attente';
  if (normalized === 'transferred' || normalized === 'transfere') return 'Transféré';
  if (normalized === 'busy') return 'Occupé';
  if (normalized === 'failed') return 'Échec';
  if (normalized === 'missed') return 'Manqué';

  return value || '-';
}

export function frenchStep(value: string) {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'outbound') return 'Appel sortant';
  if (normalized === 'inbound') return 'Appel entrant';
  if (normalized === 'inbound queue') return "File d'attente 3CX";
  if (normalized === 'internal') return 'Appel interne';
  if (normalized === 'appel sortant') return 'Appel sortant';
  if (normalized === 'file attente 3cx') return "File d'attente 3CX";
  if (normalized === 'conversation operatrice') return 'Conversation opératrice';
  if (normalized === 'fin appel') return "Fin d'appel";

  return value || '-';
}
