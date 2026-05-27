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

  const data = names.map((operator) => {
    const inboundCalls = takenByOperator.get(operator) || [];
    const probes = probesByOperator.get(operator)?.size || 0;
    const outgoing = outboundRows.filter((row) => row.operator === operator);
    const internals = internalRows.filter((row) => row.operator === operator);
    const linkedAbandons = calls.filter((call) => abandonLinkedToOperator(call, operator, rows));
    const totalCalls = inboundCalls.length + outgoing.length;
    const waitSeconds = inboundCalls.reduce((sum, call) => sum + call.wait, 0);
    const talkInbound = inboundCalls.reduce((sum, call) => sum + call.talk, 0);
    const talkOutbound = outgoing.reduce((sum, row) => sum + row.talking, 0);
    const talkSeconds = talkInbound + talkOutbound;
    const internalSeconds = internals.reduce((sum, row) => sum + row.talking, 0);
    const totalWorkSeconds = waitSeconds + talkSeconds + internalSeconds;

    return {
      label: operator,
      inbound: inboundCalls.length,
      outbound: outgoing.length,
      total: totalCalls,
      sondePrise: `${probes} / ${inboundCalls.length}`,
      priseRate: pct(inboundCalls.length, probes),
      abandons: linkedAbandons.length,
      wait: formatClock(waitSeconds),
      waitAvg: inboundCalls.length ? formatClock(waitSeconds / inboundCalls.length) : '00:00:00',
      talk: formatClock(talkSeconds),
      talkAvg: totalCalls ? formatClock(talkSeconds / totalCalls) : '00:00:00',
      internal: formatClock(internalSeconds),
      work: formatClock(totalWorkSeconds),
      details: uniqueDetails([...inboundCalls, ...linkedAbandons], outgoing),
    };
  }).sort((a, b) => b.total - a.total || b.abandons - a.abandons);

  return (
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
  );
}
