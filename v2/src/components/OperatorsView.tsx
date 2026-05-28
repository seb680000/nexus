import type { CallPath, DetailItem, Row } from '../types';
import { buildOperatorAnalysis, callDetails, isAnswered, isInbound, isInternal, isOutbound, isRealOperator, outboundDetails } from '../utils/calls';
import { formatClock } from '../utils/format';
import { DataTable } from './DataTable';
import { Panel } from './Panel';

type OperatorsViewProps = { calls: CallPath[]; rows: Row[]; setDetail: (rows: DetailItem[]) => void };
type OperatorRawScore = {
  operator: string; inbound: number; outbound: number; probes: number; availableOpportunities: number; availableTakes: number;
  linkedAbandons: number; handledParking: number; parkingPickup: number; callbackOutbounds: number;
  waitAvg: number; talkAvg: number; internalSeconds: number; totalWorkSeconds: number; presenceSeconds: number; present: boolean;
  details: DetailItem[]; inboundCalls: CallPath[]; outgoing: Row[]; presenceIntervals: Interval[];
};
type ScorePart = { label: string; key: string; score: number; weight: number; formula: string; source: string; interpretation: string; reason: string };
type Interval = { start: number; end: number };

const PRESENCE_GAP_MS = 60 * 60 * 1000;
const PRESENCE_MARGIN_BEFORE_MS = 5 * 60 * 1000;
const PRESENCE_MARGIN_AFTER_MS = 10 * 60 * 1000;

function rowEndTime(row: Row) {
  const duration = Math.max(row.talking, row.ringing, 1);
  return (row.time?.getTime() || 0) + duration * 1000;
}
function rangesOverlap(startA: number, endA: number, startB: number, endB: number) { return startA < endB && startB < endA; }
function isClientBlockingCall(row: Row) { return !isInternal(row) && (isInbound(row) || isOutbound(row)) && isAnswered(row) && row.talking > 0; }
function callInterval(call: CallPath): Interval | null {
  if (!call.date) return null;
  const duration = Math.max(call.wait + call.talk, call.wait, call.talk, 1);
  const start = call.date.getTime();
  return { start, end: start + duration * 1000 };
}
function rowInterval(row: Row): Interval | null {
  if (!row.time) return null;
  const start = row.time.getTime();
  const end = rowEndTime(row);
  return end > start ? { start, end } : null;
}
function isPresenceActivityRow(row: Row, operator: string) {
  return row.operator === operator && (isInbound(row) || isOutbound(row) || isInternal(row)) && (isAnswered(row) || row.talking > 0 || row.ringing > 0);
}
function mergedDurationSeconds(intervals: Interval[]) {
  const sorted = intervals.filter((item) => item.end > item.start).sort((a, b) => a.start - b.start || a.end - b.end);
  if (!sorted.length) return 0;
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) merged.push({ ...interval });
    else last.end = Math.max(last.end, interval.end);
  }
  return Math.round(merged.reduce((sum, interval) => sum + interval.end - interval.start, 0) / 1000);
}
function buildPresenceIntervals(operator: string, operatorRows: Row[], inboundCalls: CallPath[]) {
  const rawIntervals = [
    ...operatorRows.filter((row) => isPresenceActivityRow(row, operator)).map(rowInterval),
    ...inboundCalls.map(callInterval),
  ].filter((value): value is Interval => Boolean(value)).sort((a, b) => a.start - b.start || a.end - b.end);

  if (!rawIntervals.length) return [];

  const sessions: Interval[] = [];
  let current: Interval = {
    start: Math.max(0, rawIntervals[0].start - PRESENCE_MARGIN_BEFORE_MS),
    end: rawIntervals[0].end + PRESENCE_MARGIN_AFTER_MS,
  };

  for (const interval of rawIntervals.slice(1)) {
    const expandedStart = Math.max(0, interval.start - PRESENCE_MARGIN_BEFORE_MS);
    const expandedEnd = interval.end + PRESENCE_MARGIN_AFTER_MS;
    if (expandedStart - current.end <= PRESENCE_GAP_MS) {
      current.end = Math.max(current.end, expandedEnd);
    } else {
      sessions.push(current);
      current = { start: expandedStart, end: expandedEnd };
    }
  }
  sessions.push(current);
  return sessions;
}
function isInsidePresence(at: Date | null, presenceIntervals: Interval[]) {
  if (!at) return false;
  const timestamp = at.getTime();
  return presenceIntervals.some((interval) => timestamp >= interval.start && timestamp <= interval.end);
}
function operatorBusyAt(operator: string, at: Date | null, rows: Row[]) {
  if (!at) return false;
  const timestamp = at.getTime();
  return rows.some((row) => row.time && row.operator === operator && isClientBlockingCall(row) && row.time.getTime() <= timestamp && rowEndTime(row) >= timestamp);
}
function operatorAvailableAt(call: CallPath, operator: string, rows: Row[], presenceIntervals: Interval[]) {
  return isInsidePresence(call.date, presenceIntervals) && !operatorBusyAt(operator, call.date, rows);
}
function operatorBusyDuring(call: CallPath, operator: string, rows: Row[]) {
  if (!call.date) return false;
  const start = call.date.getTime();
  const end = start + Math.max(call.wait, 1) * 1000;
  return rows.some((row) => row.time && row.operator === operator && isClientBlockingCall(row) && rangesOverlap(start, end, row.time.getTime(), rowEndTime(row)));
}
function operatorInternalDuring(call: CallPath, operator: string, rows: Row[]) {
  if (!call.date) return false;
  const start = call.date.getTime();
  const end = start + Math.max(call.wait, 1) * 1000;
  return rows.some((row) => row.time && row.operator === operator && isInternal(row) && rangesOverlap(start, end, row.time.getTime(), rowEndTime(row)));
}
function abandonLinkedToOperator(call: CallPath, operator: string, rows: Row[], presenceIntervals: Interval[]) {
  if (!call.abandoned || !isInsidePresence(call.date, presenceIntervals)) return false;
  if (operatorInternalDuring(call, operator, rows)) return true;
  return !operatorBusyDuring(call, operator, rows);
}
function uniqueDetails(calls: CallPath[], rows: Row[]) {
  const map = new Map<string, DetailItem>();
  for (const detail of [...callDetails(calls), ...outboundDetails(rows)]) map.set(detail.id, detail);
  return [...map.values()];
}
function pct(value: number, total: number) { return total ? `${Math.round((value / total) * 100)}%` : '0%'; }
function median(values: number[]) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}
function clamp(value: number, min = 0, max = 10) { return Math.max(min, Math.min(max, value)); }
function higherIsBetter(value: number, teamMedian: number) { if (!teamMedian && !value) return 5; if (!teamMedian) return 8; return clamp(5 + ((value - teamMedian) / teamMedian) * 3); }
function lowerIsBetter(value: number, teamMedian: number) { if (!teamMedian && !value) return 5; if (!teamMedian) return 3; return clamp(5 + ((teamMedian - value) / teamMedian) * 3); }
function ratioScore(value: number) { return clamp(value * 10); }
function formatScore(value: number) { return `${clamp(value).toFixed(1)}/10`; }
function operatorParkingCount(calls: CallPath[], operator: string) { return calls.filter((call) => call.rows.some((row) => row.operator === operator && /parking|shared parking|sp\d+/i.test(`${row.to} ${row.from} ${row.activity}`))).length; }
function operatorParkingPickupCount(calls: CallPath[], operator: string) { return calls.filter((call) => call.treated && call.operator === operator && call.rows.some((row) => /parking|shared parking|sp\d+/i.test(`${row.to} ${row.from} ${row.activity}`))).length; }
function operatorCallbackCount(rows: Row[], operator: string) { return rows.filter((row) => row.operator === operator && isOutbound(row) && isAnswered(row) && row.talking >= 20).length; }
function availableOpportunities(calls: CallPath[], operator: string, rows: Row[], presenceIntervals: Interval[]) { return calls.filter((call) => operatorAvailableAt(call, operator, rows, presenceIntervals)).length; }
function availableTakes(calls: CallPath[], operator: string, rows: Row[], presenceIntervals: Interval[]) { return calls.filter((call) => call.treated && call.operator === operator && operatorAvailableAt(call, operator, rows, presenceIntervals)).length; }
function totalOperatorActivitySeconds(operator: string, operatorRows: Row[], inboundCalls: CallPath[]) {
  const rowIntervals = operatorRows
    .filter((row) => isPresenceActivityRow(row, operator))
    .map(rowInterval)
    .filter((value): value is Interval => Boolean(value));
  const callIntervals = inboundCalls.map(callInterval).filter((value): value is Interval => Boolean(value));
  return mergedDurationSeconds([...rowIntervals, ...callIntervals]);
}
function hasRealPresence(raw: Omit<OperatorRawScore, 'present'>) {
  return raw.presenceSeconds > 0 || raw.totalWorkSeconds > 0 || raw.inbound > 0 || raw.outbound > 0 || raw.handledParking > 0 || raw.parkingPickup > 0 || raw.callbackOutbounds > 0 || raw.internalSeconds > 0;
}
function sentimentExplanation(parts: ScorePart[], finalScore: number) {
  const lines = parts.map((part) => `${part.label} : ${part.score.toFixed(1)}/10 · poids ${Math.round(part.weight * 100)}% · ${part.formula} · ${part.source}`);
  return `Sentiment IA final : ${finalScore.toFixed(1)}/10\n${lines.join('\n')}`;
}
function computeSentiment(raw: OperatorRawScore, team: OperatorRawScore[]) {
  if (!raw.present) {
    return {
      sentiment: 'Non présente', sentimentValue: -1, sentimentDetail: 'Opératrice non présente sur la période : aucune note Sentiment IA calculée.', sentimentMethod: 'Aucune activité réelle détectée sur la période.',
      priseScore: 'Non présent', priseScoreMethod: 'Non calculé car opératrice absente.', abandonsScore: 'Non présent', abandonsScoreMethod: 'Non calculé car opératrice absente.', attenteScore: 'Non présent', attenteScoreMethod: 'Non calculé car opératrice absente.', paroleScore: 'Non présent', paroleScoreMethod: 'Non calculé car opératrice absente.', parkingScore: 'Non présent', parkingScoreMethod: 'Non calculé car opératrice absente.', repriseParkingScore: 'Non présent', repriseParkingScoreMethod: 'Non calculé car opératrice absente.', rappelScore: 'Non présent', rappelScoreMethod: 'Non calculé car opératrice absente.', sortantsScore: 'Non présent', sortantsScoreMethod: 'Non calculé car opératrice absente.', activiteScore: 'Non présent', activiteScoreMethod: 'Non calculé car opératrice absente.'
    };
  }
  const activeTeam = team.filter((item) => item.present);
  const availablePickupRate = raw.availableOpportunities ? raw.availableTakes / raw.availableOpportunities : 0;
  const abandonPressure = raw.availableOpportunities ? raw.linkedAbandons / raw.availableOpportunities : raw.linkedAbandons ? 1 : 0;
  const parkingEffort = raw.inbound ? raw.handledParking / raw.inbound : raw.handledParking ? 1 : 0;
  const parkingPickupEffort = raw.inbound ? raw.parkingPickup / raw.inbound : raw.parkingPickup ? 1 : 0;
  const callbackEffort = raw.inbound ? raw.callbackOutbounds / raw.inbound : raw.callbackOutbounds ? 1 : 0;
  const outboundEffort = raw.inbound ? raw.outbound / raw.inbound : raw.outbound ? 1 : 0;
  const teamWait = median(activeTeam.map((item) => item.waitAvg).filter(Boolean));
  const teamTalk = median(activeTeam.map((item) => item.talkAvg).filter(Boolean));
  const teamParking = median(activeTeam.map((item) => (item.inbound ? item.handledParking / item.inbound : 0)));
  const teamCallback = median(activeTeam.map((item) => (item.inbound ? item.callbackOutbounds / item.inbound : 0)));
  const teamOutbound = median(activeTeam.map((item) => (item.inbound ? item.outbound / item.inbound : 0)));
  const teamActivity = median(activeTeam.map((item) => item.totalWorkSeconds).filter(Boolean));
  const parts: ScorePart[] = [
    { key: 'priseScore', label: 'Prise sur disponibilité', score: ratioScore(availablePickupRate), weight: 0.22, formula: 'Formule : appels pris quand l’opératrice était présente et disponible / appels entrants sur ses plages de présence où elle était disponible × 10.', source: `Données : ${raw.availableTakes} prises disponibles / ${raw.availableOpportunities} opportunités sur présence = ${pct(raw.availableTakes, raw.availableOpportunities)}.`, interpretation: 'Début de poste, pauses longues et fin de journée sont exclus grâce aux plages de présence déduites de l’activité 3CX.', reason: `${raw.availableTakes} appels pris sur ${raw.availableOpportunities} appels pendant ses plages de présence disponible.` },
    { key: 'abandonsScore', label: 'Abandons pendant disponibilité', score: clamp(10 - abandonPressure * 10), weight: 0.14, formula: 'Formule : 10 - (abandons imputables pendant présence / opportunités disponibles pendant présence × 10).', source: `Données : ${raw.linkedAbandons} abandon(s) imputables / ${raw.availableOpportunities} opportunités sur présence.`, interpretation: 'Pénalise uniquement les abandons lorsque l’opératrice était réellement en plage de présence.', reason: `${raw.linkedAbandons} abandon(s) liés à l’opératrice sur la période.` },
    { key: 'attenteScore', label: 'Attente moyenne', score: lowerIsBetter(raw.waitAvg, teamWait), weight: 0.11, formula: 'Formule : comparaison de l’attente moyenne opératrice avec la médiane équipe. Plus bas que la médiane = meilleur score.', source: `Données : opératrice ${formatClock(raw.waitAvg)} / médiane équipe ${formatClock(teamWait)}.`, interpretation: 'Mesure la rapidité de traitement relative à l’équipe, sans comparer directement les volumes horaires.', reason: `Attente moyenne ${formatClock(raw.waitAvg)} comparée à la médiane équipe ${formatClock(teamWait)}.` },
    { key: 'paroleScore', label: 'Parole moyenne', score: lowerIsBetter(raw.talkAvg, teamTalk), weight: 0.09, formula: 'Formule : comparaison de la parole moyenne opératrice avec la médiane équipe. Plus court = meilleur score.', source: `Données : opératrice ${formatClock(raw.talkAvg)} / médiane équipe ${formatClock(teamTalk)}.`, interpretation: 'Valorise les conversations efficaces : plus le temps moyen est court, mieux le critère contribue au Sentiment IA.', reason: `Parole moyenne ${formatClock(raw.talkAvg)} comparée à la médiane équipe ${formatClock(teamTalk)}.` },
    { key: 'parkingScore', label: 'Effort parking', score: higherIsBetter(parkingEffort, teamParking), weight: 0.13, formula: 'Formule : ratio appels avec parking / entrants traités, comparé à la médiane équipe. Plus haut = meilleur score.', source: `Données : ${raw.handledParking} parking(s) / ${raw.inbound} entrants traités. Médiane équipe : ${Math.round(teamParking * 100)}%.`, interpretation: 'Valorise les opératrices qui mettent en parking au lieu de perdre l’appel quand un transfert immédiat n’est pas possible.', reason: `${raw.handledParking} appel(s) avec usage parking.` },
    { key: 'repriseParkingScore', label: 'Reprise après parking', score: higherIsBetter(parkingPickupEffort, teamParking), weight: 0.09, formula: 'Formule : appels repris ou finalisés après parking / entrants traités, comparé à la médiane parking équipe.', source: `Données : ${raw.parkingPickup} reprise(s) parking / ${raw.inbound} entrants traités.`, interpretation: 'Valorise la récupération utile d’un appel parqué, pas seulement le fait de le mettre en attente.', reason: `${raw.parkingPickup} appel(s) repris ou finalisés après parking.` },
    { key: 'rappelScore', label: 'Effort de rappel', score: higherIsBetter(callbackEffort, teamCallback), weight: 0.12, formula: 'Formule : rappels ou sortants utiles / entrants traités, comparé à la médiane équipe.', source: `Données : ${raw.callbackOutbounds} rappel(s) utiles / ${raw.inbound} entrants traités. Médiane équipe : ${Math.round(teamCallback * 100)}%.`, interpretation: 'Valorise l’effort de rappel car il récupère des opportunités perdues et améliore le service client.', reason: `${raw.callbackOutbounds} rappel(s) ou sortant(s) utiles détectés.` },
    { key: 'sortantsScore', label: 'Sortants utiles', score: higherIsBetter(outboundEffort, teamOutbound), weight: 0.06, formula: 'Formule : sortants clients utiles / entrants traités, comparé à la médiane équipe.', source: `Données : ${raw.outbound} sortant(s) client >= 20 sec / ${raw.inbound} entrants traités.`, interpretation: 'Valorise les appels sortants réels sans surpondérer ce critère.', reason: `${raw.outbound} appel(s) sortant(s) client de 20 secondes ou plus.` },
    { key: 'activiteScore', label: 'Activité relative', score: higherIsBetter(raw.totalWorkSeconds, teamActivity), weight: 0.04, formula: 'Formule : temps utile réel fusionné par créneaux horaires, comparé à la médiane équipe. Les durées superposées ne sont comptées qu’une fois.', source: `Données : opératrice ${formatClock(raw.totalWorkSeconds)} / médiane équipe ${formatClock(teamActivity)}.`, interpretation: 'Évite de doubler une durée quand plusieurs lignes 3CX couvrent le même horaire.', reason: `Temps utile réel ${formatClock(raw.totalWorkSeconds)} comparé à la médiane équipe ${formatClock(teamActivity)}.` },
  ];
  const finalScore = clamp(parts.reduce((sum, part) => sum + part.score * part.weight, 0));
  const partMap = Object.fromEntries(parts.map((part) => [part.key, formatScore(part.score)]));
  const methodMap = Object.fromEntries(parts.map((part) => [`${part.key}Method`, `${part.label}\nPoids : ${Math.round(part.weight * 100)}%\n${part.formula}\n${part.source}\n${part.interpretation}`]));
  return { sentiment: formatScore(finalScore), sentimentValue: finalScore, sentimentDetail: sentimentExplanation(parts, finalScore), sentimentMethod: `Sentiment IA = somme des sous-notes pondérées.\n${parts.map((part) => `${part.label} ${part.score.toFixed(1)} × ${Math.round(part.weight * 100)}%`).join('\n')}\nRésultat : ${finalScore.toFixed(1)}/10.`, ...partMap, ...methodMap };
}

export function OperatorsView({ calls, rows, setDetail }: OperatorsViewProps) {
  const { takenByOperator, probesByOperator } = buildOperatorAnalysis(calls);
  const outboundRows = rows.filter((row) => isOutbound(row) && isAnswered(row) && row.talking >= 20 && isRealOperator(row.operator));
  const internalRows = rows.filter((row) => isInternal(row) && isAnswered(row) && isRealOperator(row.operator));
  const names = [...new Set([...takenByOperator.keys(), ...probesByOperator.keys(), ...rows.map((row) => row.operator).filter(isRealOperator)])].sort();
  const rawData: OperatorRawScore[] = names.map((operator) => {
    const inboundCalls = takenByOperator.get(operator) || [];
    const probes = probesByOperator.get(operator)?.size || 0;
    const outgoing = outboundRows.filter((row) => row.operator === operator);
    const internals = internalRows.filter((row) => row.operator === operator);
    const waitSeconds = inboundCalls.reduce((sum, call) => sum + call.wait, 0);
    const talkInbound = inboundCalls.reduce((sum, call) => sum + call.talk, 0);
    const talkOutbound = outgoing.reduce((sum, row) => sum + row.talking, 0);
    const talkSeconds = talkInbound + talkOutbound;
    const internalSeconds = internals.reduce((sum, row) => sum + row.talking, 0);
    const handledParking = operatorParkingCount(calls, operator);
    const parkingPickup = operatorParkingPickupCount(calls, operator);
    const callbackOutbounds = operatorCallbackCount(rows, operator);
    const presenceIntervals = buildPresenceIntervals(operator, rows, inboundCalls);
    const presenceSeconds = mergedDurationSeconds(presenceIntervals);
    const totalWorkSeconds = totalOperatorActivitySeconds(operator, rows, inboundCalls);
    const baseRaw = { operator, inbound: inboundCalls.length, outbound: outgoing.length, probes, availableOpportunities: 0, availableTakes: 0, linkedAbandons: 0, handledParking, parkingPickup, callbackOutbounds, waitAvg: inboundCalls.length ? waitSeconds / inboundCalls.length : 0, talkAvg: inboundCalls.length + outgoing.length ? talkSeconds / (inboundCalls.length + outgoing.length) : 0, internalSeconds, totalWorkSeconds, presenceSeconds, presenceIntervals, details: uniqueDetails(inboundCalls, outgoing), inboundCalls, outgoing };
    const present = hasRealPresence(baseRaw);
    const opportunities = present ? availableOpportunities(calls, operator, rows, presenceIntervals) : 0;
    const takes = present ? availableTakes(calls, operator, rows, presenceIntervals) : 0;
    const linkedAbandons = present ? calls.filter((call) => abandonLinkedToOperator(call, operator, rows, presenceIntervals)) : [];
    return { ...baseRaw, availableOpportunities: opportunities, availableTakes: takes, linkedAbandons: linkedAbandons.length, details: uniqueDetails([...inboundCalls, ...linkedAbandons], outgoing), present };
  });
  const data = rawData.map((raw) => {
    const totalCalls = raw.inbound + raw.outbound;
    const waitSeconds = raw.inboundCalls.reduce((sum, call) => sum + call.wait, 0);
    const talkInbound = raw.inboundCalls.reduce((sum, call) => sum + call.talk, 0);
    const talkOutbound = raw.outgoing.reduce((sum, row) => sum + row.talking, 0);
    const talkSeconds = talkInbound + talkOutbound;
    return { label: raw.operator, inbound: raw.inbound, outbound: raw.outbound, total: totalCalls, presence: raw.present ? formatClock(raw.presenceSeconds) : 'Non présente', sondePrise: raw.present ? `${raw.availableOpportunities} / ${raw.availableTakes}` : 'Non présente', priseRate: raw.present ? pct(raw.availableTakes, raw.availableOpportunities) : 'Non présente', abandons: raw.present ? raw.linkedAbandons : 'Non présente', parking: raw.handledParking, reprisesParking: raw.parkingPickup, rappels: raw.callbackOutbounds, wait: formatClock(waitSeconds), waitAvg: raw.inbound ? formatClock(raw.waitAvg) : '00:00:00', talk: formatClock(talkSeconds), talkAvg: totalCalls ? formatClock(raw.talkAvg) : '00:00:00', internal: formatClock(raw.internalSeconds), work: formatClock(raw.totalWorkSeconds), details: raw.details };
  }).sort((a, b) => Number(b.total) - Number(a.total));
  const sentimentData = rawData.filter((raw) => raw.present).map((raw) => {
    const sentiment = computeSentiment(raw, rawData);
    return { label: raw.operator, sentiment: sentiment.sentiment, sentimentValue: sentiment.sentimentValue, sentimentMethod: sentiment.sentimentMethod, priseStats: `${raw.availableTakes} / ${raw.availableOpportunities} (${pct(raw.availableTakes, raw.availableOpportunities)})`, priseScore: sentiment.priseScore, priseScoreMethod: sentiment.priseScoreMethod, abandonStats: `${raw.linkedAbandons} (${pct(raw.linkedAbandons, raw.availableOpportunities)})`, abandonsScore: sentiment.abandonsScore, abandonsScoreMethod: sentiment.abandonsScoreMethod, attenteStats: formatClock(raw.waitAvg), attenteScore: sentiment.attenteScore, attenteScoreMethod: sentiment.attenteScoreMethod, paroleStats: formatClock(raw.talkAvg), paroleScore: sentiment.paroleScore, paroleScoreMethod: sentiment.paroleScoreMethod, parkingStats: `${raw.handledParking} (${pct(raw.handledParking, raw.inbound)})`, parkingScore: sentiment.parkingScore, parkingScoreMethod: sentiment.parkingScoreMethod, repriseParkingStats: raw.parkingPickup, repriseParkingScore: sentiment.repriseParkingScore, repriseParkingScoreMethod: sentiment.repriseParkingScoreMethod, rappelStats: `${raw.callbackOutbounds} (${pct(raw.callbackOutbounds, raw.inbound)})`, rappelScore: sentiment.rappelScore, rappelScoreMethod: sentiment.rappelScoreMethod, sortantsStats: raw.outbound, sortantsScore: sentiment.sortantsScore, sortantsScoreMethod: sentiment.sortantsScoreMethod, activiteStats: formatClock(raw.totalWorkSeconds), activiteScore: sentiment.activiteScore, activiteScoreMethod: sentiment.activiteScoreMethod, sentimentDetail: sentiment.sentimentDetail, details: raw.details };
  }).sort((a, b) => Number(b.sentimentValue) - Number(a.sentimentValue));
  return (
    <>
      <Panel title="Analyse operatrices">
        <DataTable rows={data} columns={[["label", "Operatrice"], ["presence", "Presence estimee"], ["inbound", "Entrants traites"], ["outbound", "Sortants clients"], ["total", "Total appels"], ["sondePrise", "Dispo / prise"], ["priseRate", "Taux prise dispo"], ["abandons", "Abandons imputables"], ["parking", "Parking"], ["reprisesParking", "Reprises parking"], ["rappels", "Rappels utiles"], ["wait", "Attente totale"], ["waitAvg", "Attente moy."], ["talk", "Parole totale"], ["talkAvg", "Parole moy."], ["internal", "Interne"], ["work", "Temps total"]]} onOpen={(row) => setDetail(row.details)} />
      </Panel>
      <Panel title="Sentiment IA operatrices">
        <DataTable rows={sentimentData} columns={[["label", "Operatrice"], ["sentiment", "Sentiment IA"], ["priseStats", "Prise dispo"], ["abandonStats", "Abandons"], ["attenteStats", "Attente moy."], ["paroleStats", "Parole moy."], ["parkingStats", "Effort parking"], ["repriseParkingStats", "Reprise parking"], ["rappelStats", "Effort rappel"], ["sortantsStats", "Sortants utiles"], ["activiteStats", "Activite relative"], ["sentimentDetail", "Explication NEX"]]} onOpen={(row) => setDetail(row.details)} />
      </Panel>
    </>
  );
}
