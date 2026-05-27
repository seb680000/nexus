import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CallPath, ChartBucket, ChartMetric, DetailItem, Row, ViewKey } from '../types';
import { callDetails, outboundDetails, totalDays, dateRangeLabel } from '../utils/calls';
import { frDate } from '../utils/dates';
import { formatDuration } from '../utils/format';
import { nexMetricHelp } from '../utils/nexHelp';
import { Panel } from './Panel';
import { StatCard } from './StatCard';

export const chartMetricOptions: { key: ChartMetric; label: string }[] = [
  { key: 'invoiceTotal', label: 'Total a facturer' },
  { key: 'treated', label: 'Appels traites' },
  { key: 'abandoned', label: 'Abandonnes' },
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

export function NexChartTooltip({ active, payload, label, metricLabel, metric }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  const data = payload[0]?.payload || {};
  const operators = Array.isArray(data.operatorSummary) ? data.operatorSummary : [];
  return (
    <div className="nexTooltip wideTooltip">
      <strong>NEX · {label}</strong>
      <b>{metricLabel} : {formatChartValue(value, metric)}</b>
      <p>{nexMetricHelp(metricLabel)}</p>
      <div className="tooltipTotals"><span>Entrants traités : {data.treatedCount || 0}</span><span>Sortants : {data.outboundCount || 0}</span></div>
      {operators.length > 0 && <div className="tooltipOperators">{operators.map((line: string) => <small key={line}>{line}</small>)}</div>}
      <em>Cliquer sur le point pour ouvrir le détail des appels.</em>
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
  chartMetric: ChartMetric;
  setChartMetric: (metric: ChartMetric) => void;
  chartBucket: ChartBucket;
  setChartBucket: (bucket: ChartBucket) => void;
  setDetail: (rows: DetailItem[]) => void;
  setActiveView: (view: ViewKey) => void;
};

export function openChartDetails(data: any, setDetail: (rows: DetailItem[]) => void) {
  const rows = Array.isArray(data?.detailRows) ? data.detailRows : [];
  if (rows.length) setDetail(rows);
}

export function DashboardView({ stats, rows, chartData, chartMetric, setChartMetric, chartBucket, setChartBucket, setDetail, setActiveView }: DashboardViewProps) {
  const selectedMetric = chartMetricOptions.find((option) => option.key === chartMetric)?.label || 'Total a facturer';
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
        <section className="filters chartFilters">
          <label title={nexMetricHelp('Indicateur courbe')}>Indicateur courbe
            <select value={chartMetric} onChange={(event) => setChartMetric(event.target.value as ChartMetric)}>{chartMetricOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
          </label>
          <label>Vue graphique
            <select value={chartBucket} onChange={(event) => setChartBucket(event.target.value as ChartBucket)}>{chartBucketOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
          </label>
        </section>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData} onClick={(event: any) => openChartDetails(event?.activePayload?.[0]?.payload, setDetail)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatChartValue(value, chartMetric)} />
            <Tooltip content={<NexChartTooltip metricLabel={selectedMetric} metric={chartMetric} />} />
            <Line type="linear" dataKey="value" name={selectedMetric} dot={{ r: 5 }} activeDot={{ r: 8 }} className="clickableChart"><LabelList dataKey="value" position="top" formatter={(value: unknown) => chartLabelFormatter(value, chartMetric)} /></Line>
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </>
  );
}
