import type { CallbackInfo, CallbackSettings, CallPath, DetailItem, DurationFilter, Row, Service } from '../types';
import { dayKey, frDateTime, inBusinessHours } from './dates';
import { secondsFromDuration } from './format';
import { frenchStatus, frenchStep } from './labels';

export const OUTBOUND_MIN_TALK_SECONDS = 20;

const blockedNames = [
  'support',
  'voice mail',
  'voicemail',
  'operateur',
  'opérateur',
  'repondeur',
  'répondeur',
  'client premium',
  'client forfait',
  'queue',
];

export function isQueue(row: Row) {
  return row.direction.toLowerCase() === 'inbound queue';
}

export function isWaiting(row: Row) {
  return row.status.toLowerCase() === 'waiting';
}

export function isUnanswered(row: Row) {
  return row.status.toLowerCase() === 'unanswered';
}

export function isAnswered(row: Row) {
  return row.status.toLowerCase() === 'answered';
}

export function isInbound(row: Row) {
  return row.direction.toLowerCase() === 'inbound';
}

export function isOutbound(row: Row) {
  return row.direction.toLowerCase() === 'outbound';
}

export function isInternal(row: Row) {
  return row.direction.toLowerCase() === 'internal';
}

export function phoneFrom(value: string) {
  return String(value || '').trim().match(/0\d{6,}/)?.[0] || '';
}

export function looksLikePhone(value: string) {
  return /^\+?\d[\d\s.-]{6,}$/.test(String(value || '').trim());
}

export function isClientName(value: string) {
  const normalized = String(value || '').trim();
  return Boolean(
    normalized &&
      normalized !== 'Client non identifie' &&
      !looksLikePhone(normalized) &&
      /[A-Za-zÀ-ÿ]/.test(normalized)
  );
}

export function cleanName(raw: string) {
  const value = String(raw || '').replace(/\(\d+\)/g, '').trim();
  const lower = value.toLowerCase();

  if (!value || blockedNames.some((blocked) => lower.includes(blocked)) || /\bA\d{1,3}\b/i.test(raw)) {
    return '';
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .reverse()
    .join(' ');
}

export function operatorName(value: string) {
  return /\(\d+\)/.test(value) ? cleanName(value) : '';
}

export function operatorFromActivity(text: string) {
  const matches = [...String(text || '').matchAll(/(?:taken by|replaced by|transferred to)\s+([^>\n]+?\s*\(\d+\))/gi)];

  for (const match of matches.reverse()) {
    const name = cleanName(match[1]);
    if (name) return name;
  }

  return '';
}

export function clientFrom(row: Record<string, string>) {
  const details = row['Call Activity Details'] || '';
  const match =
    details.match(/A\d+\s+([^()]+)\s*\((0\d{6,})\)/i) ||
    details.match(/:\s*([^()]+)\s*\((0\d{6,})\)/i);

  const fromDetails = String(match?.[1] || '').trim();
  if (isClientName(fromDetails)) return fromDetails;

  return isClientName(row.From) ? String(row.From || '').trim() : 'Client non identifie';
}

export function serviceFromText(text: string): Service {
  const lower = String(text || '').toLowerCase();
  if (lower.includes('client premium')) return 'premium';
  if (lower.includes('client forfait')) return 'forfait';
  return 'autre';
}

export function isOperatorBusy(row: Row) {
  const text = `${row.status} ${row.activity}`.toLowerCase();
  return text.includes('busy') || text.includes('already') || text.includes('déjà') || text.includes('deja');
}

export function isOperatorProbe(row: Row) {
  return isInbound(row) && Boolean(row.operator) && !isOperatorBusy(row) && (row.ringing > 0 || isAnswered(row));
}

export function groupBy<T>(items: T[], selector: (item: T) => string) {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const key = selector(item);
    map.set(key, [...(map.get(key) || []), item]);
  }

  return map;
}

export function mapRows(rawRows: Record<string, string>[], parseDate: (value: string) => Date | null): Row[] {
  return rawRows
    .map((raw, index) => {
      const time = parseDate(raw['Call Time']);
      const activity = String(raw['Call Activity Details'] || '').trim();

      return {
        id: `${index}-${raw['Call ID'] || ''}`,
        callId: String(raw['Call ID'] || '').trim() || String(index),
        time,
        day: dayKey(time),
        month: dayKey(time).slice(0, 7),
        from: String(raw.From || '').trim(),
        to: String(raw.To || '').trim(),
        direction: String(raw.Direction || '').trim(),
        status: String(raw.Status || '').trim(),
        ringing: secondsFromDuration(raw.Ringing),
        talking: secondsFromDuration(raw.Talking),
        client: clientFrom(raw),
        phone: phoneFrom(raw.From) || phoneFrom(activity),
        operator: operatorName(raw.To) || operatorName(raw.From) || operatorFromActivity(activity),
        activity,
      };
    })
    .filter((row) => row.time);
}

export function buildCalls(rows: Row[]) {
  const calls: CallPath[] = [];

  for (const [callId, list] of groupBy(rows.filter((row) => inBusinessHours(row.time)), (row) => row.callId)) {
    const sorted = [...list].sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0));
    const queueRows = sorted.filter((row) => isQueue(row) && (isWaiting(row) || isUnanswered(row)));

    if (!queueRows.length) continue;

    const answeredRows = sorted.filter((row) => isInbound(row) && isAnswered(row));
    const operator =
      answeredRows.map((row) => row.operator).find(Boolean) ||
      sorted.map((row) => row.operator).find(Boolean) ||
      operatorFromActivity(sorted.map((row) => row.activity).join(' ')) ||
      'Non identifie';

    const treated = queueRows.some(isWaiting);
    const abandoned = !treated && queueRows.some(isUnanswered);
    const text = sorted.map((row) => `${row.to} ${row.from} ${row.activity}`).join(' ');

    calls.push({
      callId,
      day: queueRows[0].day,
      month: queueRows[0].month,
      date: queueRows[0].time,
      client:
        queueRows.find((row) => isClientName(row.client))?.client ||
        sorted.find((row) => isClientName(row.client))?.client ||
        'Client non identifie',
      phone: sorted.map((row) => row.phone).find(Boolean) || '',
      service: serviceFromText(text),
      operator,
      treated,
      abandoned,
      wait: queueRows.reduce((sum, row) => sum + Math.max(row.ringing, row.talking), 0),
      talk: answeredRows.reduce((sum, row) => sum + row.talking, 0),
      rows: sorted,
    });
  }

  return calls;
}

export function callDetails(calls: CallPath[]): DetailItem[] {
  return calls.flatMap((call) => {
    const base = { client: call.client, operator: call.operator, phone: call.phone };
    const items: DetailItem[] = [
      {
        id: `${call.callId}-wait`,
        date: frDateTime(call.date),
        ...base,
        step: frenchStep('File attente 3CX'),
        status: call.abandoned && !call.treated ? frenchStatus('Abandoned') : frenchStatus('Transferred'),
        wait: call.wait,
        talk: 0,
      },
    ];

    if (call.talk > 0) {
      items.push({
        id: `${call.callId}-talk`,
        date: frDateTime(call.date),
        ...base,
        step: frenchStep('Conversation operatrice'),
        status: frenchStatus('Answered'),
        wait: 0,
        talk: call.talk,
      });
    }

    if (call.abandoned && !call.treated) {
      items.push({
        id: `${call.callId}-lost`,
        date: frDateTime(call.date),
        ...base,
        step: frenchStep('Fin appel'),
        status: frenchStatus('Unanswered'),
        wait: 0,
        talk: 0,
      });
    }

    return items;
  });
}

export function outboundDetails(rows: Row[]): DetailItem[] {
  return rows
    .filter((row) => isOutbound(row) && isAnswered(row) && row.talking >= OUTBOUND_MIN_TALK_SECONDS)
    .map((row) => ({
      id: row.id,
      date: frDateTime(row.time),
      client: row.client,
      operator: row.operator || 'Non identifie',
      phone: row.phone,
      step: frenchStep('Outbound'),
      status: frenchStatus(row.status),
      wait: 0,
      talk: row.talking,
    }));
}

export function isDurationMatch(seconds: number, filter: DurationFilter) {
  if (filter === 'gt5') return seconds > 5;
  if (filter === 'gt10') return seconds > 10;
  if (filter === 'gt30') return seconds > 30;
  if (filter === 'gt60') return seconds > 60;
  return true;
}

export function getOperatorCallback(call: CallPath, outboundRows: Row[], minCallback: number): CallbackInfo {
  if (!call.phone || !call.date) return null;

  const found = outboundRows.find(
    (row) => row.phone === call.phone && row.time && row.time > call.date! && row.talking >= minCallback
  );

  return found ? { operator: found.operator || 'Non identifie', time: found.time, duration: found.talking } : null;
}

export function getUserCallback(call: CallPath, allRows: Row[], minUserCallback: number): CallbackInfo {
  if (!call.phone || !call.date) return null;

  const found = allRows.find(
    (row) =>
      isInbound(row) &&
      isAnswered(row) &&
      row.phone === call.phone &&
      row.time &&
      row.time > call.date! &&
      row.talking >= minUserCallback
  );

  return found ? { operator: found.operator || 'Non identifie', time: found.time, duration: found.talking } : null;
}

export function statusForAbandon(call: CallPath, operatorCallback: CallbackInfo, userCallback: CallbackInfo) {
  if (call.wait < 5) return 'Appel de moins de 5 secondes';
  if (operatorCallback && userCallback) return 'Traité + rappel utilisateur';
  if (operatorCallback) return 'Traité';
  if (userCallback) return 'Utilisateur a déjà rappelé';
  return 'À rappeler';
}

export function summarize(calls: CallPath[], rawRows: Row[], callback: CallbackSettings) {
  const treated = calls.filter((call) => call.treated);
  const abandoned = calls.filter((call) => call.abandoned);
  const total = treated.length + abandoned.length;
  const business = rawRows.filter((row) => inBusinessHours(row.time));
  const outboundRows = business.filter((row) => isOutbound(row) && isAnswered(row) && row.talking >= OUTBOUND_MIN_TALK_SECONDS);
  const eligible = abandoned.filter(
    (call) => callback.families.includes(call.service) && call.wait > callback.minAbandon
  );

  const operatorCallbacks = new Map<string, CallbackInfo>();
  const userCallbacks = new Map<string, CallbackInfo>();

  for (const call of abandoned) {
    operatorCallbacks.set(call.callId, getOperatorCallback(call, outboundRows, callback.minCallback));
    userCallbacks.set(call.callId, getUserCallback(call, business, callback.minUserCallback));
  }

  const callbacksDone = eligible.filter((call) => operatorCallbacks.get(call.callId)).length;
  const callbacksRemaining = eligible.filter(
    (call) => !operatorCallbacks.get(call.callId) && !userCallbacks.get(call.callId)
  ).length;
  const abandonedOver5 = abandoned.filter((call) => call.wait > 5);

  return {
    calls,
    treated,
    abandoned,
    total,
    maxWait: abandoned.reduce((max, call) => Math.max(max, call.wait), 0),
    avgAbandonedWait: abandoned.length ? abandoned.reduce((sum, call) => sum + call.wait, 0) / abandoned.length : 0,
    avgTalk: treated.length ? treated.reduce((sum, call) => sum + call.talk, 0) / treated.length : 0,
    abandonedOver5: abandonedOver5.length,
    premiumOver5: abandonedOver5.filter((call) => call.service === 'premium').length,
    forfaitOver5: abandonedOver5.filter((call) => call.service === 'forfait').length,
    internal: business.filter((row) => isInternal(row) && isAnswered(row)).length,
    outbound: outboundRows.length,
    outboundRows,
    operatorCallbacks,
    userCallbacks,
    callbacksDone,
    callbacksRemaining,
    invoiceTotal: treated.length + callbacksDone + outboundRows.length,
    answerRate: total ? Math.round((treated.length / total) * 100) : 0,
  };
}

export function totalDays(rows: Row[]) {
  return new Set(rows.map((row) => row.day).filter((key) => key !== 'inconnu')).size;
}

export function dateRangeLabel(rows: Row[], formatDate: (date: Date | null) => string) {
  const dates = rows
    .map((row) => row.time)
    .filter(Boolean)
    .sort((a, b) => a!.getTime() - b!.getTime());

  return dates.length ? `${formatDate(dates[0])} au ${formatDate(dates[dates.length - 1])}` : '-';
}

export function buildOperatorAnalysis(calls: CallPath[]) {
  const takenByOperator = new Map<string, CallPath[]>();
  const probesByOperator = new Map<string, Set<string>>();

  for (const call of calls) {
    if (call.treated && call.operator && call.operator !== 'Non identifie') {
      takenByOperator.set(call.operator, [...(takenByOperator.get(call.operator) || []), call]);
    }

    for (const row of call.rows) {
      if (!isOperatorProbe(row)) continue;
      const set = probesByOperator.get(row.operator) || new Set<string>();
      set.add(`${call.callId}:${row.operator}`);
      probesByOperator.set(row.operator, set);
    }
  }

  return { takenByOperator, probesByOperator };
}
