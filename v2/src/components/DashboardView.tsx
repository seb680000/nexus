import { useState } from 'react';
import { CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CallPath, ChartBucket, ChartMetric, DetailItem, Row, ViewKey } from '../types';
import { callDetails, outboundDetails, totalDays, dateRangeLabel } from '../utils/calls';
import { frDate } from '../utils/dates';
import { formatDuration } from '../utils/format';
import { nexMetricHelp } from '../utils/nexHelp';
import { DataTable } from './DataTable';
import { Panel } from './Panel';
import { StatCard } from './StatCard';

export const chartMetricOptions: { key: ChartMetric; label: string }[] = [
  { key: 'invoiceTotal', label: 'Total a facturer' },
  { key: 'treated', label: 'Appels traites' },
  { key: 'abandoned', label: 'Appels abandonnes' },
  { key: 'total', label: 'Total entrants' },
  { key: 'outbound', label: 'Sortants clients' },
  { key: 'callbacksDone', label: 'Rappels realises' },
  { key: 'callbacksRemaining', label: 'Rappels restants' },
  { key: 'internal', label: 'Inter-collab.' },
  { key: 'maxWait', label: 'Attente max' },
  { key: 'avgAbandonedWait', label: 'Attente moy.' },
  { key: 'avgTalk', label: 'Parole moy.' },
];

export const chartBucketOptions: { key: ChartBucket; label: string }[] = [
  { key: 'hour', label: 'Par heure' },
  { key: 'm30', label: 'Par 30 minutes' },
  { key: 'm15', label: 'Par 15 minutes' },
  { key: 'm10', label: 'Par 10 minutes' },
  { key: 'm5', label: 'Par 5 minutes' },
  { key: 'minute', label: 'Par minute' },
];

const metricColors: Record<ChartMetric, string> = {
  invoiceTotal: '#2563eb',
  treated: '#16a34a',
  abandoned: '#dc2626',
  total: '#7c3aed',
  outbound: '#ea580c',
  callbacksDone: '#0891b2',
  callbacksRemaining: '#ca8a04',
  internal: '#475569',
  maxWait: '#be123c',
  avgAbandonedWait: '#9333ea',
  avgTalk: '#0f766e',
};

export function isDurationMetric(metric: ChartMetric) {
  return metric === 'maxWait' || metric === 'avgAbandonedWait' || metric === 'avgTalk';
}

export function formatChartValue(value: unknown, metric: ChartMetric) {
  const numericValue = Number(value || 0);
  if (!isDurationMetric(metric)) return numericValue.toLocaleString('fr-FR');
  const total = Math.max(0, Math.round(numericValue));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes <= 0 ? `${seconds}s` : `${minutes}m${String(seconds).padStart(2, '0')}`;
}

export function chartLabelFormatter(value: unknown, metric: ChartMetric) {
  return formatChartValue(value, metric);
}

export function NexChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload || {};
  const operators = Array.isArray(data.operatorSummary) ? data.operatorSummary : [];
  return (
    <div className="nexTooltip wideTooltip">
      <strong>NEX · {label}</strong>
      {payload.map((entry: any) => (
        <b key={entry.dataKey} style={{ color: entry.color }}>{entry.name} : {formatChartValue(entry.value, entry.dataKey)}</b>
      ))}
      <p>{nexMetricHelp('Indicateur courbe')}</p>
      <div className="tooltipTotals"><span>Entrants traités : {data.treatedCount || 0}</span><span>Sortants : {data.outboundCount || 0}</span></div>
      {operators.length > 0 && <div className="tooltipOperators">{operators.map((line: string) => <small key={line}>{line}</small>)}</div>}
      <em>Cliquer sur le point pour afficher le détail des appels sous la courbe.</em>
    </div>
  );
}

type DashboardStats = {
  calls: CallPath[];
  treated: CallPath[];
  abandoned: CallPath[];
  total: number;
  maxWait: number;
  avgAbandonedWait: number;
  avgTalk: number;
  abandonedOver5: number;
  premiumOver5: number;
  forfaitOver5: number;
  internal: number;
  outbound: number;
  outboundRows: Row[];
  callbacksDone: number;
  callbacksRemaining: number;
  invoiceTotal: number;
  answerRate: number;
};

type ChartPoint = Record<string, any>;

type DashboardViewProps = {
  stats: DashboardStats;
  rows: Row[];
  chartData: ChartPoint[];
  chartMetrics: ChartMetric[];
  setChartMetrics: (metrics: ChartMetric[]) => void;
  chartBucket: ChartBucket;
  setChartBucket: (bucket: ChartBucket) => void;
  chartOperators: string[];
  setChartOperators: (operators: string[]) => void;
  operators: string[];
  setDetail: (rows: DetailItem[]) => void;
  setActiveView: (view: ViewKey) => void;
};

export function openChartDetails(data: any, setRows: (rows: DetailItem[]) => void) {
  const rows = Array.isArray(data?.detailRows) ? data.detailRows : [];
  setRows(rows);
}

function metricLabel(metric: ChartMetric) {
  return chartMetricOptions.find((option) => option.key === metric)?.label || metric;
}

function toggleList<T extends string>(value: T, current: T[], fallback: T) {
  if (value === fallback) return [fallback];
  const base = current.filter((item) => item !== fallback);
  const next = base.includes(value) ? base.filter((item) => item !== value) : [...base, value];
  return next.length ? next : [fallback];
}

export function DashboardView({ stats, rows, chartData, chartMetrics, setChartMetrics, chartBucket, setChartBucket, chartOperators, setChartOperators, operators, setDetail, setActiveView }: DashboardViewProps) {
  const [selectedRows, setSelectedRows] = useState<DetailItem[]>([]);
  const visibleMetrics = chartMetrics.length ? chartMetrics : ['invoiceTotal', 'abandoned'];

  return (
    <>
      <section className="cards">
        <StatCard title="Dates CSV" value={totalDays(rows)} subtitle={dateRangeLabel(rows, frDate)} />
        <StatCard title="Appels traites" value={`${stats.treated.length} / ${stats.total}`} subtitle={`${stats.answerRate}% des entrants`} onClick={() => setDetail(callDetails(stats.treated))} />
        <StatCard title="Abandonnes" value={stats.abandoned.length} subtitle={`Dont ${stats.abandonedOver5} appel(s) de plus de 5 secondes · Premium ${stats.premiumOver5} · Forfait ${stats.forfaitOver5}`} tone="danger" onClick={() => setActiveView('abandoned')} />
        <StatCard title="Total entrants" value={stats.total} subtitle="traites + abandonnes" onClick={() => setDetail(callDetails(stats.calls))} />
        <StatCard title="Total a facturer" value={stats.invoiceTotal} subtitle="clients + rappels + sortants" />
        <StatCard title="Sortants clients" value={stats.outbound} subtitle="repondus >= 20 sec" onClick={() => setDetail(outboundDetails(stats.outboundRows))} />
        <StatCard title="Rappels realises" value={stats.callbacksDone} subtitle={`${stats.callbacksDone} rappel(s) operatrice`} onClick={() => setActiveView('abandoned')} />
        <StatCard title="Rappels restants" value={stats.callbacksRemaining} subtitle="selon parametrage actif" onClick={() => setActiveView('settings')} />
        <StatCard title="Inter-collab." value={stats.internal} subtitle="appels internes" />
        <StatCard title="Attente max" value={formatDuration(stats.maxWait)} subtitle="abandonnes" />
        <StatCard title="Attente moy." value={formatDuration(stats.avgAbandonedWait)} subtitle="abandonnes" />
        <StatCard title="Parole moy." value={formatDuration(stats.avgTalk)} subtitle={`${stats.treated.length} conversations`} />
      </section>

      <Panel title="Courbe par periode">
        <section className="filters chartFilters multiChartFilters">
          <label>Indicateurs courbe</label>
          <div className="operatorBox chartChoiceBox">
            {chartMetricOptions.map((option) => (
              <label key={option.key}>
                <input type="checkbox" checked={visibleMetrics.includes(option.key)} onChange={() => setChartMetrics(toggleList(option.key, visibleMetrics, 'invoiceTotal') as ChartMetric[])} />
                {option.label}
              </label>
            ))}
          </div>

          <label>Vue graphique
            <select value={chartBucket} onChange={(event) => setChartBucket(event.target.value as ChartBucket)}>{chartBucketOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
          </label>

          <label>Par operatrice</label>
          <div className="operatorBox chartChoiceBox">
            <label><input type="checkbox" checked={chartOperators.includes('all')} onChange={() => setChartOperators(['all'])} /> Toutes</label>
            {operators.map((operator) => (
              <label key={operator}>
                <input type="checkbox" checked={!chartOperators.includes('all') && chartOperators.includes(operator)} onChange={() => setChartOperators(toggleList(operator, chartOperators, 'all'))} />
                {operator}
              </label>
            ))}
          </div>
        </section>

        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={chartData} onClick={(event: any) => openChartDetails(event?.activePayload?.[0]?.payload, setSelectedRows)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" interval="preserveStartEnd" />
            <YAxis />
            <Tooltip content={<NexChartTooltip />} />
            <Legend />
            {visibleMetrics.map((metric) => (
              <Line key={metric} type="linear" dataKey={metric} name={metricLabel(metric)} stroke={metricColors[metric]} dot={{ r: 5 }} activeDot={{ r: 8 }} className="clickableChart">
                <LabelList dataKey={metric} position="top" formatter={(value: unknown) => chartLabelFormatter(value, metric)} />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>

        {selectedRows.length > 0 && (
          <section className="chartDetailsBelow">
            <h3>Détail des appels du point sélectionné</h3>
            <DataTable
              rows={selectedRows}
              columns={[
                ['date', 'Date'],
                ['client', 'Client'],
                ['operator', 'Operatrice'],
                ['phone', 'Telephone'],
                ['step', 'Etape'],
                ['status', 'Statut'],
                ['wait', 'Attente'],
                ['talk', 'Parole'],
              ]}
              onOpen={(row) => setDetail([row])}
            />
          </section>
        )}
      </Panel>
    </>
  );
}
