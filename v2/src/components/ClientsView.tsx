import type { CallPath, DetailItem } from '../types';
import { getOperatorCallback, getUserCallback, isAnswered, isInbound, isInternal, isOutbound, isRealOperator } from '../utils/calls';
import { formatClock } from '../utils/format';
import { DataTable } from './DataTable';
import { Panel } from './Panel';

type ClientsViewProps = {
  calls: CallPath[];
  callbackSettings: { families: any[]; minAbandon: number; minCallback: number; minUserCallback: number };
  outboundRows: any[];
  businessRows: any[];
  setDetail: (rows: DetailItem[]) => void;
};

function median(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function isClientName(value: string) {
  return Boolean(value && value !== 'Client non identifie' && /[A-Za-zÀ-ÿ]/.test(value));
}

function hhmm(date: Date | null) {
  if (!date) return '-';
  return `${String(date.getHours()).padStart(2, '0')}h${String(date.getMinutes()).padStart(2, '0')}`;
}

function rowEndTime(row: any) {
  const duration = Math.max(row.talking || 0, row.ringing || 0, 1);
  return (row.time?.getTime() || 0) + duration * 1000;
}

function isUsefulInternal(row: any) {
  const text = `${row.to} ${row.from} ${row.activity}`.toLowerCase();
  return text.includes('supervision') || text.includes('formation') || text.includes('assistance') || text.includes('transfert');
}

function isBlockingCall(row: any) {
  if (isInternal(row) && !isUsefulInternal(row)) return false;
  if (!(isInbound(row) || isOutbound(row) || isInternal(row))) return false;
  if (!isAnswered(row) || row.talking <= 0) return false;
  return true;
}

function operatorOnLineAt(operator: string, at: Date | null, businessRows: any[]) {
  if (!at) return false;
  const timestamp = at.getTime();
  return businessRows.some((row) => {
    if (!row.time || row.operator !== operator) return false;
    if (!isBlockingCall(row)) return false;
    return row.time.getTime() <= timestamp && rowEndTime(row) >= timestamp;
  });
}

function lastBlockingEndBefore(operator: string, at: Date | null, businessRows: any[]) {
  if (!at) return null;
  const timestamp = at.getTime();
  const lastEnd = businessRows
    .filter((row) => row.time && row.operator === operator && isBlockingCall(row))
    .map(rowEndTime)
    .filter((endTime) => endTime <= timestamp)
    .sort((a, b) => b - a)[0];

  return lastEnd || null;
}

function formatAvailableSince(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m${String(remainingSeconds).padStart(2, '0')}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${String(remainingMinutes).padStart(2, '0')}`;
}

function availableOperator(call: CallPath, businessRows: any[]) {
  const operators = [...new Set(businessRows.map((row) => row.operator).filter(isRealOperator))].sort();
  const at = call.date?.getTime() || 0;
  const available = operators
    .filter((operator) => !operatorOnLineAt(operator, call.date, businessRows))
    .map((operator) => {
      const lastEnd = lastBlockingEndBefore(operator, call.date, businessRows);
      const availableSeconds = lastEnd ? Math.max(0, Math.round((at - lastEnd) / 1000)) : 0;
      return `${operator} · dispo depuis ${lastEnd ? formatAvailableSince(availableSeconds) : 'début période'}`;
    });

  return available.join(', ') || 'Aucune disponible détectée';
}

function displayOperator(call: CallPath) {
  if (isRealOperator(call.operator)) return call.operator;
  const detected = call.rows.map((row) => row.operator).find(isRealOperator);
  return detected || 'À attribuer';
}

function callLineDetails(calls: CallPath[], businessRows: any[]): DetailItem[] {
  return calls.map((call) => {
    const operator = displayOperator(call);
    return {
      id: call.callId,
      date: hhmm(call.date),
      client: call.client,
      operator,
      availableOperator: availableOperator(call, businessRows),
      phone: call.phone,
      step: call.treated ? 'Appel traité' : 'Appel non traité',
      status: call.treated ? `Traité par ${operator}` : operator === 'À attribuer' ? 'Non traité / opératrice à attribuer' : `Non traité / détecté chez ${operator}`,
      wait: call.wait,
      talk: call.talk,
    };
  });
}

export function ClientsView({ calls, callbackSettings, outboundRows, businessRows, setDetail }: ClientsViewProps) {
  const groups = new Map<string, CallPath[]>();

  for (const call of calls) {
    if (!isClientName(call.client)) continue;
    groups.set(call.client, [...(groups.get(call.client) || []), call]);
  }

  const rows = [...groups.entries()].map(([label, list]) => {
    const treated = list.filter((call) => call.treated);
    const abandoned = list.filter((call) => call.abandoned);
    const recalled = abandoned.filter((call) => {
      const operatorCallback = getOperatorCallback(call, outboundRows, callbackSettings.minCallback);
      const userCallback = getUserCallback(call, businessRows, callbackSettings.minUserCallback);
      return Boolean(operatorCallback || userCallback);
    });
    const waitValues = list.map((call) => call.wait).filter((value) => value > 0);
    const talkValues = treated.map((call) => call.talk).filter((value) => value > 0);

    return {
      label,
      total: list.length,
      totalDetails: callLineDetails(list, businessRows),
      treated: treated.length,
      treatedDetails: callLineDetails(treated, businessRows),
      treatedRate: list.length ? Math.round((treated.length / list.length) * 100) : 0,
      abandoned: abandoned.length,
      abandonedDetails: callLineDetails(abandoned, businessRows),
      abandonedRate: list.length ? Math.round((abandoned.length / list.length) * 100) : 0,
      recalls: recalled.length,
      recallsDetails: callLineDetails(recalled, businessRows),
      wait: formatClock(list.reduce((sum, call) => sum + call.wait, 0)),
      waitMedian: formatClock(median(waitValues)),
      talk: formatClock(list.reduce((sum, call) => sum + call.talk, 0)),
      talkMedian: formatClock(median(talkValues)),
      details: callLineDetails(list, businessRows),
    };
  }).sort((a, b) => b.total - a.total);

  return (
    <Panel title="Analyse clients">
      <DataTable
        rows={rows}
        columns={[
          ['label', 'Client'],
          ['total', 'Total'],
          ['treated', 'Traites'],
          ['treatedRate', 'Traites %'],
          ['abandoned', 'Abandonnes'],
          ['abandonedRate', 'Abandonnes %'],
          ['recalls', 'Nombre de rappels'],
          ['wait', 'Attente'],
          ['waitMedian', 'Attente mediane'],
          ['talk', 'Parole'],
          ['talkMedian', 'Parole mediane'],
        ]}
        onOpen={(row) => setDetail(row.details)}
      />
    </Panel>
  );
}
