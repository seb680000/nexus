import type { CallPath, DetailItem, Row } from '../types';
import { buildOperatorAnalysis, callDetails, isAnswered, isInbound, isInternal, isOutbound, outboundDetails } from '../utils/calls';
import { formatClock } from '../utils/format';
import { DataTable } from './DataTable';
import { Panel } from './Panel';

type OperatorsViewProps = {
  calls: CallPath[];
  rows: Row[];
  setDetail: (rows: DetailItem[]) => void;
};

type OperatorRawScore = {
  operator: string;
  inbound: number;
  outbound: number;
  probes: number;
  linkedAbandons: number;
  handledParking: number;
  parkingPickup: number;
  callbackOutbounds: number;
  waitAvg: number;
  talkAvg: number;
  internalSeconds: number;
  totalWorkSeconds: number;
  details: DetailItem[];
  inboundCalls: CallPath[];
  outgoing: Row[];
};

type ScorePart = {
  label: string;
  key: string;
  score: number;
  weight: number;
  reason: string;
};

function rowEndTime(row: Row) {
  const duration = Math.max(row.talking, row.ringing, 1);
  return (row.time?.getTime() || 0) + duration * 1000;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

function operatorBusyDuring(call: CallPath, operator: string, rows: Row[]) {
  if (!call.date) return false;
  const start = call.date.getTime();
  const end = start + Math.max(call.wait, 1) * 1000;

  return rows.some((row) => {
    if (!row.time || row.operator !== operator) return false;
    if (isInternal(row)) return false;
    if (!(isInbound(row) || isOutbound(row)) || !isAnswered(row) || row.talking <= 0) return false;
    return rangesOverlap(start, end, row.time.getTime(), rowEndTime(row));
  });
}

function operatorInternalDuring(call: CallPath, operator: string, rows: Row[]) {
  if (!call.date) return false;
  const start = call.date.getTime();
  const end = start + Math.max(call.wait, 1) * 1000;

  return rows.some((row) => row.time && row.operator === operator && isInternal(row) && rangesOverlap(start, end, row.time.getTime(), rowEndTime(row)));
}

function abandonLinkedToOperator(call: CallPath, operator: string, rows: Row[]) {
  if (!call.abandoned) return false;
  if (operatorInternalDuring(call, operator, rows)) return true;
  return !operatorBusyDuring(call, operator, rows);
}

function uniqueDetails(calls: CallPath[], rows: Row[]) {
  const map = new Map<string, DetailItem>();
  for (const detail of [...callDetails(calls), ...outboundDetails(rows)]) {
    map.set(detail.id, detail);
  }
  return [...map.values()];
}

function pct(value: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function median(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function clamp(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, value));
}

function higherIsBetter(value: number, teamMedian: number) {
  if (!teamMedian && !value) return 5;
  if (!teamMedian) return 8;
  return clamp(5 + ((value - teamMedian) / teamMedian) * 3);
}

function lowerIsBetter(value: number, teamMedian: number) {
  if (!teamMedian && !value) return 5;
  if (!teamMedian) return 3;
  return clamp(5 + ((teamMedian - value) / teamMedian) * 3);
}

function ratioScore(value: number) {
  return clamp(value * 10);
}

function formatScore(value: number) {
  return `${clamp(value).toFixed(1)}/10`;
}

function operatorParkingCount(calls: CallPath[], operator: string) {
  return calls.filter((call) => call.rows.some((row) => row.operator === operator && /parking|shared parking|sp\d+/i.test(`${row.to} ${row.from} ${row.activity}`))).length;
}

function operatorParkingPickupCount(calls: CallPath[], operator: string) {
  return calls.filter((call) => call.treated && call.operator === operator && call.rows.some((row) => /parking|shared parking|sp\d+/i.test(`${row.to} ${row.from} ${row.activity}`))).length;
}

function operatorCallbackCount(rows: Row[], operator: string) {
  return rows.filter((row) => row.operator === operator && isOutbound(row) && isAnswered(row) && row.talking >= 20).length;
}

function sentimentExplanation(parts: ScorePart[], finalScore: number) {
  const lines = parts.map((part) => `${part.label} : ${part.score.toFixed(1)}/10 · poids ${Math.round(part.weight * 100)}% · ${part.reason}`);
  return `Sentiment IA final : ${finalScore.toFixed(1)}/10\n${lines.join('\n')}`;
}

function computeSentiment(raw: OperatorRawScore, team: OperatorRawScore[]) {
  const priseRate = raw.probes ? raw.inbound / raw.probes : 0;
  const abandonPressure = raw.probes ? raw.linkedAbandons / raw.probes : raw.linkedAbandons ? 1 : 0;
  const parkingEffort = raw.inbound ? raw.handledParking / raw.inbound : raw.handledParking ? 1 : 0;
  const parkingPickupEffort = raw.inbound ? raw.parkingPickup / raw.inbound : raw.parkingPickup ? 1 : 0;
  const callbackEffort = raw.inbound ? raw.callbackOutbounds / raw.inbound : raw.callbackOutbounds ? 1 : 0;
  const outboundEffort = raw.inbound ? raw.outbound / raw.inbound : raw.outbound ? 1 : 0;

  const teamWait = median(team.map((item) => item.waitAvg).filter(Boolean));
  const teamTalk = median(team.map((item) => item.talkAvg).filter(Boolean));
  const teamParking = median(team.map((item) => (item.inbound ? item.handledParking / item.inbound : 0)));
  const teamCallback = median(team.map((item) => (item.inbound ? item.callbackOutbounds / item.inbound : 0)));
  const teamOutbound = median(team.map((item) => (item.inbound ? item.outbound / item.inbound : 0)));
  const teamActivity = median(team.map((item) => item.totalWorkSeconds).filter(Boolean));

  const parts: ScorePart[] = [
    {
      key: 'priseScore',
      label: 'Qualité de prise',
      score: ratioScore(priseRate),
      weight: 0.18,
      reason: `${raw.inbound} appels pris sur ${raw.probes} sollicitations. Le volume brut ne suffit pas, le taux de prise est utilisé.`,
    },
    {
      key: 'abandonsScore',
      label: 'Abandons imputables',
      score: clamp(10 - abandonPressure * 10),
      weight: 0.14,
      reason: `${raw.linkedAbandons} abandon(s) liés à l’opératrice sur la période. Moins il y en a, meilleure est l’appréciation.`,
    },
    {
      key: 'attenteScore',
      label: 'Attente moyenne',
      score: lowerIsBetter(raw.waitAvg, teamWait),
      weight: 0.12,
      reason: `Attente moyenne ${formatClock(raw.waitAvg)} comparée à la médiane équipe ${formatClock(teamWait)}.`,
    },
    {
      key: 'paroleScore',
      label: 'Parole moyenne',
      score: lowerIsBetter(Math.abs(raw.talkAvg - teamTalk), teamTalk || raw.talkAvg || 1),
      weight: 0.10,
      reason: `Parole moyenne ${formatClock(raw.talkAvg)} comparée à la médiane équipe ${formatClock(teamTalk)}. L’objectif est l’efficacité sans conversation anormalement longue.`,
    },
    {
      key: 'parkingScore',
      label: 'Effort parking',
      score: higherIsBetter(parkingEffort, teamParking),
      weight: 0.15,
      reason: `${raw.handledParking} appel(s) avec usage parking. Ce critère valorise l’effort de mise en parking quand le traitement immédiat n’est pas possible.`,
    },
    {
      key: 'repriseParkingScore',
      label: 'Reprise après parking',
      score: higherIsBetter(parkingPickupEffort, teamParking),
      weight: 0.10,
      reason: `${raw.parkingPickup} appel(s) repris ou finalisés après parking. Ce critère valorise la récupération utile d’un appel parqué.`,
    },
    {
      key: 'rappelScore',
      label: 'Effort de rappel',
      score: higherIsBetter(callbackEffort, teamCallback),
      weight: 0.14,
      reason: `${raw.callbackOutbounds} rappel(s) ou sortant(s) utiles détectés. Les rappels sont valorisés car ils réduisent la perte client.`,
    },
    {
      key: 'sortantsScore',
      label: 'Sortants utiles',
      score: higherIsBetter(outboundEffort, teamOutbound),
      weight: 0.08,
      reason: `${raw.outbound} appel(s) sortant(s) client de 20 secondes ou plus.`,
    },
    {
      key: 'activiteScore',
      label: 'Activité relative',
      score: higherIsBetter(raw.totalWorkSeconds, teamActivity),
      weight: 0.09,
      reason: `Temps utile ${formatClock(raw.totalWorkSeconds)} comparé à la médiane équipe ${formatClock(teamActivity)}. Le poids reste faible pour ne pas pénaliser les plannings plus courts.`,
    },
  ];

  const finalScore = clamp(parts.reduce((sum, part) => sum + part.score * part.weight, 0));
  const partMap = Object.fromEntries(parts.map((part) => [part.key, formatScore(part.score)]));

  return {
    sentiment: formatScore(finalScore),
    sentimentValue: finalScore,
    sentimentDetail: sentimentExplanation(parts, finalScore),
    ...partMap,
  };
}

export function OperatorsView({ calls, rows, setDetail }: OperatorsViewProps) {
  const { takenByOperator, probesByOperator } = buildOperatorAnalysis(calls);
  const outboundRows = rows.filter((row) => isOutbound(row) && isAnswered(row) && row.talking >= 20 && row.operator && row.operator !== 'Non identifie');
  const internalRows = rows.filter((row) => isInternal(row) && isAnswered(row) && row.operator && row.operator !== 'Non identifie');
  const names = [...new Set([
    ...takenByOperator.keys(),
    ...probesByOperator.keys(),
    ...outboundRows.map((row) => row.operator),
    ...internalRows.map((row) => row.operator),
  ])].sort();

  const rawData: OperatorRawScore[] = names.map((operator) => {
    const inboundCalls = takenByOperator.get(operator) || [];
    const probes = probesByOperator.get(operator)?.size || 0;
    const outgoing = outboundRows.filter((row) => row.operator === operator);
    const internals = internalRows.filter((row) => row.operator === operator);
    const linkedAbandons = calls.filter((call) => abandonLinkedToOperator(call, operator, rows));
    const waitSeconds = inboundCalls.reduce((sum, call) => sum + call.wait, 0);
    const talkInbound = inboundCalls.reduce((sum, call) => sum + call.talk, 0);
    const talkOutbound = outgoing.reduce((sum, row) => sum + row.talking, 0);
    const talkSeconds = talkInbound + talkOutbound;
    const internalSeconds = internals.reduce((sum, row) => sum + row.talking, 0);

    return {
      operator,
      inbound: inboundCalls.length,
      outbound: outgoing.length,
      probes,
      linkedAbandons: linkedAbandons.length,
      handledParking: operatorParkingCount(calls, operator),
      parkingPickup: operatorParkingPickupCount(calls, operator),
      callbackOutbounds: operatorCallbackCount(rows, operator),
      waitAvg: inboundCalls.length ? waitSeconds / inboundCalls.length : 0,
      talkAvg: inboundCalls.length + outgoing.length ? talkSeconds / (inboundCalls.length + outgoing.length) : 0,
      internalSeconds,
      totalWorkSeconds: waitSeconds + talkSeconds + internalSeconds,
      details: uniqueDetails([...inboundCalls, ...linkedAbandons], outgoing),
      inboundCalls,
      outgoing,
    };
  });

  const data = rawData.map((raw) => {
    const totalCalls = raw.inbound + raw.outbound;
    const waitSeconds = raw.inboundCalls.reduce((sum, call) => sum + call.wait, 0);
    const talkInbound = raw.inboundCalls.reduce((sum, call) => sum + call.talk, 0);
    const talkOutbound = raw.outgoing.reduce((sum, row) => sum + row.talking, 0);
    const talkSeconds = talkInbound + talkOutbound;

    return {
      label: raw.operator,
      inbound: raw.inbound,
      outbound: raw.outbound,
      total: totalCalls,
      sondePrise: `${raw.probes} / ${raw.inbound}`,
      priseRate: pct(raw.inbound, raw.probes),
      abandons: raw.linkedAbandons,
      parking: raw.handledParking,
      reprisesParking: raw.parkingPickup,
      rappels: raw.callbackOutbounds,
      wait: formatClock(waitSeconds),
      waitAvg: raw.inbound ? formatClock(raw.waitAvg) : '00:00:00',
      talk: formatClock(talkSeconds),
      talkAvg: totalCalls ? formatClock(raw.talkAvg) : '00:00:00',
      internal: formatClock(raw.internalSeconds),
      work: formatClock(raw.totalWorkSeconds),
      details: raw.details,
    };
  }).sort((a, b) => b.total - a.total);

  const sentimentData = rawData.map((raw) => {
    const sentiment = computeSentiment(raw, rawData);
    return {
      label: raw.operator,
      sentiment: sentiment.sentiment,
      sentimentValue: sentiment.sentimentValue,
      priseScore: sentiment.priseScore,
      abandonsScore: sentiment.abandonsScore,
      attenteScore: sentiment.attenteScore,
      paroleScore: sentiment.paroleScore,
      parkingScore: sentiment.parkingScore,
      repriseParkingScore: sentiment.repriseParkingScore,
      rappelScore: sentiment.rappelScore,
      sortantsScore: sentiment.sortantsScore,
      activiteScore: sentiment.activiteScore,
      sentimentDetail: sentiment.sentimentDetail,
      details: raw.details,
    };
  }).sort((a, b) => Number(b.sentimentValue) - Number(a.sentimentValue));

  return (
    <>
      <Panel title="Analyse operatrices">
        <DataTable
          rows={data}
          columns={[
            ['label', 'Operatrice'],
            ['inbound', 'Entrants traites'],
            ['outbound', 'Sortants clients'],
            ['total', 'Total appels'],
            ['sondePrise', 'Sonde / prise'],
            ['priseRate', 'Taux prise'],
            ['abandons', 'Abandons imputables'],
            ['parking', 'Parking'],
            ['reprisesParking', 'Reprises parking'],
            ['rappels', 'Rappels utiles'],
            ['wait', 'Attente totale'],
            ['waitAvg', 'Attente moy.'],
            ['talk', 'Parole totale'],
            ['talkAvg', 'Parole moy.'],
            ['internal', 'Interne'],
            ['work', 'Temps total'],
          ]}
          onOpen={(row) => setDetail(row.details)}
        />
      </Panel>

      <Panel title="Sentiment IA operatrices">
        <DataTable
          rows={sentimentData}
          columns={[
            ['label', 'Operatrice'],
            ['sentiment', 'Sentiment IA'],
            ['priseScore', 'Qualite prise'],
            ['abandonsScore', 'Abandons'],
            ['attenteScore', 'Attente moy.'],
            ['paroleScore', 'Parole moy.'],
            ['parkingScore', 'Effort parking'],
            ['repriseParkingScore', 'Reprise parking'],
            ['rappelScore', 'Effort rappel'],
            ['sortantsScore', 'Sortants utiles'],
            ['activiteScore', 'Activite relative'],
            ['sentimentDetail', 'Explication NEX'],
          ]}
          onOpen={(row) => setDetail(row.details)}
        />
      </Panel>
    </>
  );
}
