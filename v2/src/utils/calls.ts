import type { CallbackInfo, CallbackSettings, CallPath, DetailItem, DurationFilter, Row, Service } from '../types';
import { dayKey, frDateTime, inBusinessHours } from './dates';
import { secondsFromDuration } from './format';
import { frenchStatus, frenchStep } from './labels';

export const OUTBOUND_MIN_TALK_SECONDS = 20;

const excludedOperatorNames = [
  'sebastien schmitt',
  'sébastien schmitt',
  'domaine la clairiere',
  'domaine la clairière',
  'caroline amidieu',
];

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
  'shared parking',
  'parking',
  'domaine la clairiere',
  'domaine la clairière',
  'caroline amidieu',
];

const normalizedExcludedOperatorNames = excludedOperatorNames.map((name) => normalizeName(name));

export function normalizeName(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isRealOperator(value: string) {
  const normalized = normalizeName(value);
  return Boolean(value && value !== 'Non identifie' && !normalizedExcludedOperatorNames.includes(normalized));
}

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

export function isParkingTransfer(row: Row) {
  return /transferred to shared parking|transferred to parking/i.test(row.activity);
}

export function isParkingStorage(row: Row) {
  const endpoint = `${row.to} ${row.from}`.toLowerCase();
  return endpoint.includes('shared parking') || /\bsp\d+\b/i.test(endpoint);
}

export function isParking(row: Row) {
  return isParkingTransfer(row) || isParkingStorage(row);
}

export function isSystemOrSupportStep(row: Row) {
  const text = `${row.to} ${row.from} ${row.activity}`.toLowerCase();
  return (
    text.includes('support d') ||
    text.includes('support') ||
    text.includes('voice mail') ||
    text.includes('voicemail') ||
    text.includes('repondeur') ||
    text.includes('répondeur') ||
    text.includes('shared parking')
  );
}

function rowEndTimestamp(row: Row) {
  const duration = Math.max(row.talking, row.ringing, 1);
  return (row.time?.getTime() || 0) + duration * 1000;
}

function elapsedSeconds(start: Date | null, endTimestamp: number) {
  if (!start) return 0;
  return Math.max(0, Math.round((endTimestamp - start.getTime()) / 1000));
}

function callEndTimestamp(call: CallPath) {
  return call.rows.reduce((max, row) => Math.max(max, rowEndTimestamp(row)), call.date?.getTime() || 0);
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

  const name = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .reverse()
    .join(' ');

  return isRealOperator(name) ? name : '';
}

export function operatorName(value: string) {
  const name = /\(\d+\)/.test(value) ? cleanName(value) : '';
  return isRealOperator(name) ? name : '';
}

export function operatorFromActivity(text: string) {
  const matches = [...String(text || '').matchAll(/(?:taken by|replaced by|transferred to)\s+([^>\n]+?\s*\(\d+\))/gi)];

  for (const match of matches.reverse()) {
    const name = cleanName(match[1]);
    if (isRealOperator(name)) return name;
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
  return isInbound(row) && isRealOperator(row.operator) && !isOperatorBusy(row) && (row.ringing > 0 || isAnswered(row));
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
      const operator = operatorName(raw.To) || operatorName(raw.From) || operatorFromActivity(activity);

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
        operator: isRealOperator(operator) ? operator : '',
        activity,
      };
    })
    .filter((row) => row.time);
}

function usefulHumanRowsAfterParking(sorted: Row[]) {
  const lastParkingStorageIndex = sorted.map(isParkingStorage).lastIndexOf(true);
  if (lastParkingStorageIndex < 0) return [];

  return sorted.slice(lastParkingStorageIndex + 1).filter((row) => {
    return isInbound(row) && isAnswered(row) && isRealOperator(row.operator) && !isParkingStorage(row) && !isSystemOrSupportStep(row) && row.talking > 0;
  });
}

function finalOperatorAfterParking(sorted: Row[]) {
  return usefulHumanRowsAfterParking(sorted).map((row) => row.operator).find(isRealOperator) || '';
}

function hasUsefulHumanAnswerAfterLastParking(sorted: Row[]) {
  return usefulHumanRowsAfterParking(sorted).length > 0;
}

function isLostWhileParked(sorted: Row[]) {
  const hasParking = sorted.some(isParkingStorage) || sorted.some(isParkingTransfer);
  if (!hasParking) return false;
  return !hasUsefulHumanAnswerAfterLastParking(sorted);
}

function firstUsefulAnswerAfterParkingTime(sorted: Row[]) {
  return usefulHumanRowsAfterParking(sorted).map((row) => row.time).find(Boolean) || null;
}

function waitUntilParkingPickup(queueStart: Date | null, sorted: Row[]) {
  const pickupTime = firstUsefulAnswerAfterParkingTime(sorted);
  if (!pickupTime || !queueStart) return 0;
  return elapsedSeconds(queueStart, pickupTime.getTime());
}

function talkAfterParking(sorted: Row[], operator: string) {
  const pickupTime = firstUsefulAnswerAfterParkingTime(sorted);
  if (!pickupTime) return 0;

  return sorted
    .filter((row) => row.time && row.time >= pickupTime && row.operator === operator && isInbound(row) && isAnswered(row) && !isParkingStorage(row) && !isSystemOrSupportStep(row))
    .reduce((sum, row) => sum + row.talking, 0);
}

function lastCallEnd(sorted: Row[]) {
  return sorted.reduce((max, row) => Math.max(max, rowEndTimestamp(row)), 0);
}

export function buildCalls(rows: Row[]) {
  const calls: CallPath[] = [];

  for (const [callId, list] of groupBy(rows.filter((row) => inBusinessHours(row.time)), (row) => row.callId)) {
    const sorted = [...list].sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0));
    const queueRows = sorted.filter((row) => isQueue(row) && (isWaiting(row) || isUnanswered(row)));

    if (!queueRows.length) continue;

    const answeredRows = sorted.filter((row) => isInbound(row) && isAnswered(row) && isRealOperator(row.operator));
    const hasParking = sorted.some(isParkingStorage) || sorted.some(isParkingTransfer);
    const parkedLost = isLostWhileParked(sorted);
    const parkingOperator = hasParking ? finalOperatorAfterParking(sorted) : '';
    const normalOperator =
      answeredRows.map((row) => row.operator).find(isRealOperator) ||
      sorted.map((row) => row.operator).find(isRealOperator) ||
      operatorFromActivity(sorted.map((row) => row.activity).join(' ')) ||
      'Non identifie';
    const operator = isRealOperator(parkingOperator) ? parkingOperator : isRealOperator(normalOperator) ? normalOperator : 'Non identifie';

    const treated = hasParking ? Boolean(parkingOperator) && !parkedLost : queueRows.some(isWaiting);
    const abandoned = parkedLost || (!treated && queueRows.some(isUnanswered));
    const text = sorted.map((row) => `${row.to} ${row.from} ${row.activity}`).join(' ');
    const baseWait = queueRows.reduce((sum, row) => sum + Math.max(row.ringing, row.talking), 0);
    const parkingWait = hasParking && !parkedLost ? waitUntilParkingPickup(queueRows[0].time, sorted) : 0;
    const lostWait = hasParking && parkedLost ? elapsedSeconds(queueRows[0].time, lastCallEnd(sorted)) : 0;

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
      wait: parkedLost ? Math.max(baseWait, lostWait) : hasParking ? Math.max(baseWait, parkingWait) : baseWait,
      talk: parkedLost ? 0 : hasParking ? talkAfterParking(sorted, operator) : answeredRows.reduce((sum, row) => sum + row.talking, 0),
      rows: sorted,
    });
  }

  return calls;
}

export function callDetails(calls: CallPath[]): DetailItem[] {
  return calls.flatMap((call) => {
    const base = { client: call.client, operator: isRealOperator(call.operator) ? call.operator : 'Non identifie', phone: call.phone };
    const hasParking = call.rows.some(isParkingStorage) || call.rows.some(isParkingTransfer);
    const lostWhileParked = hasParking && call.abandoned && !call.treated;
    const parkingRows = call.rows.filter((row) => isParkingStorage(row) || isParkingTransfer(row));
    const items: DetailItem[] = [
      {
        id: `${call.callId}-wait`,
        date: frDateTime(call.date),
        ...base,
        step: frenchStep('File attente 3CX'),
        status: lostWhileParked ? 'Perdu pendant parking' : call.abandoned && !call.treated ? frenchStatus('Abandoned') : hasParking ? 'Repris après parking' : frenchStatus('Transferred'),
        wait: call.wait,
        talk: 0,
      },
    ];

    if (hasParking) {
      parkingRows.forEach((row, index) => {
        const isLastParking = index === parkingRows.length - 1;
        items.push({
          id: `${call.callId}-parking-${index}`,
          date: frDateTime(row.time),
          ...base,
          step: isParkingTransfer(row) ? 'Mise en parking' : 'Appel parqué',
          status: lostWhileParked && isLastParking ? 'Perdu pendant parking' : isParkingTransfer(row) ? 'Envoyé en parking' : 'Parqué',
          wait: Math.max(row.ringing, row.talking),
          talk: 0,
        });
      });
    }

    if (call.talk > 0) {
      items.push({
        id: `${call.callId}-talk`,
        date: frDateTime(firstUsefulAnswerAfterParkingTime(call.rows) || call.date),
        ...base,
        step: hasParking ? 'Conversation après parking' : frenchStep('Conversation operatrice'),
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
        step: lostWhileParked ? 'Fin appel parqué' : frenchStep('Fin appel'),
        status: lostWhileParked ? 'À rappeler' : frenchStatus('Unanswered'),
        wait: 0,
        talk: 0,
      });
    }

    return items;
  });
}

export function outboundDetails(rows: Row[]): DetailItem[] {
  return rows
    .filter((row) => isOutbound(row) && isAnswered(row) && row.talking >= OUTBOUND_MIN_TALK_SECONDS && isRealOperator(row.operator))
    .map((row) => ({
      id: row.id,
      date: frDateTime(row.time),
      client: row.client,
      operator: row.operator,
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
  const afterCallEnd = callEndTimestamp(call);

  const found = outboundRows.find(
    (row) => row.callId !== call.callId && row.phone === call.phone && row.time && row.time.getTime() > afterCallEnd && row.talking >= minCallback && isRealOperator(row.operator)
  );

  return found ? { operator: found.operator, time: found.time, duration: found.talking } : null;
}

export function getUserCallback(call: CallPath, allRows: Row[], minUserCallback: number): CallbackInfo {
  if (!call.phone || !call.date) return null;
  const afterCallEnd = callEndTimestamp(call);

  const found = allRows.find(
    (row) =>
      row.callId !== call.callId &&
      isInbound(row) &&
      isAnswered(row) &&
      row.phone === call.phone &&
      row.time &&
      row.time.getTime() > afterCallEnd &&
      row.talking >= minUserCallback
  );

  return found ? { operator: isRealOperator(found.operator) ? found.operator : 'Non identifie', time: found.time, duration: found.talking } : null;
}

export function statusForAbandon(call: CallPath, operatorCallback: CallbackInfo, userCallback: CallbackInfo) {
  const parkedLost = (call.rows.some(isParkingStorage) || call.rows.some(isParkingTransfer)) && call.abandoned && !call.treated;
  if (parkedLost && operatorCallback) return 'Traité après perte parking';
  if (parkedLost && userCallback) return 'Utilisateur a déjà rappelé après parking';
  if (parkedLost) return 'À rappeler - perdu pendant parking';
  if (call.wait < 5) return 'Appel de moins de 5 secondes';
  if (operatorCallback && userCallback) return 'Traité + rappel utilisateur';
  if (operatorCallback) return 'Traité';
  if (userCallback) return 'Utilisateur a déjà rappelé';
  return 'À rappeler';
}

export function summarize(calls: CallPath[], rawRows: Row[], callback: CallbackSettings) {
  const treated = calls.filter((call) => call.treated && isRealOperator(call.operator));
  const abandoned = calls.filter((call) => call.abandoned);
  const total = treated.length + abandoned.length;
  const business = rawRows.filter((row) => inBusinessHours(row.time));
  const outboundRows = business.filter((row) => isOutbound(row) && isAnswered(row) && row.talking >= OUTBOUND_MIN_TALK_SECONDS && isRealOperator(row.operator));
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
    internal: business.filter((row) => isInternal(row) && isAnswered(row) && isRealOperator(row.operator)).length,
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
    if (call.treated && isRealOperator(call.operator)) {
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
