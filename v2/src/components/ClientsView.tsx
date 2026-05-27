import type { CallPath, DetailItem } from '../types';
import { callDetails, getOperatorCallback, getUserCallback } from '../utils/calls';
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
      treated: treated.length,
      treatedRate: list.length ? Math.round((treated.length / list.length) * 100) : 0,
      abandoned: abandoned.length,
      abandonedRate: list.length ? Math.round((abandoned.length / list.length) * 100) : 0,
      recalls: recalled.length,
      wait: formatClock(list.reduce((sum, call) => sum + call.wait, 0)),
      waitMedian: formatClock(median(waitValues)),
      talk: formatClock(list.reduce((sum, call) => sum + call.talk, 0)),
      talkMedian: formatClock(median(talkValues)),
      details: callDetails(list),
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
