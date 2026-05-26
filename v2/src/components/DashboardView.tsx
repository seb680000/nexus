import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CallPath, ChartMetric, DetailItem, Row, ViewKey } from '../types';
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

export function isDurationMetric(metric: ChartMetric) {
  return metric === 'maxWait' || metric === 'avgAbandonedWait' || metric === 'avgTalk';
}

export function formatChartValue(value: unknown, metric: ChartMetric) {
  const numericValue = Number(value || 0);

  if (!isDurationMetric(metric)) {
    return numericValue.toLocaleString('fr-FR');
  }

  const total = Math.max(0, Math.round(numericValue));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m${String(seconds).padStart(2, '0')}`;
}

export function NexChartTooltip({ active, payload, label, metricLabel, metric }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;

  return (
    <div className="nexTooltip">
      <strong>NEX · {label}</strong>
      <b>{metricLabel} : {formatChartValue(value, metric)}</b>
      <p>{nexMetricHelp(metricLabel)}</p>
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

type DashboardViewProps = {
  stats: DashboardStats;
  rows: Row[];
  chartData: Array<Record<string, string | number>>;
  chartMetric: ChartMetric;
  setChartMetric: (metric: ChartMetric) => void;
  setDetail: (rows: DetailItem[]) => void;
  setActiveView: (view: ViewKey) => void;
};

export function DashboardView({ stats, rows, chartData, chartMetric, setChartMetric, setDetail, setActiveView }: DashboardViewProps) {
  const selectedMetric = chartMetricOptions.find((option) => option.key === chartMetric)?.label || 'Total a facturer';

  return (
    <>
      <section className="cards">
        <StatCard title="Dates CSV" value={totalDays(rows)} subtitle={dateRangeLabel(rows, frDate)} />
        <StatCard
          title="Appels traites"
          value={`${stats.treated.length} / ${stats.total}`}
          subtitle={`${stats.answerRate}% des entrants`}
          onClick={() => setDetail(callDetails(stats.treated))}
        />
        <StatCard
          title="Abandonnes"
          value={stats.abandoned.length}
          subtitle={`Dont ${stats.abandonedOver5} appel(s) de plus de 5 secondes · Premium ${stats.premiumOver5} · Forfait ${stats.forfaitOver5}`}
          tone="danger"
          onClick={() => setActiveView('abandoned')}
        />
        <StatCard
          title="Total entrants"
          value={stats.total}
          subtitle="traites + abandonnes"
          onClick={() => setDetail(callDetails(stats.calls))}
        />
        <StatCard title="Total a facturer" value={stats.invoiceTotal} subtitle="clients + rappels + sortants" />
        <StatCard
          title="Sortants clients"
          value={stats.outbound}
          subtitle="repondus >= 20 sec"
          onClick={() => setDetail(outboundDetails(stats.outboundRows))}
        />
        <StatCard
          title="Rappels realises"
          value={stats.callbacksDone}
          subtitle={`${stats.callbacksDone} rappel(s) operatrice`}
          onClick={() => setActiveView('abandoned')}
        />
        <StatCard
          title="Rappels restants"
          value={stats.callbacksRemaining}
          subtitle="selon parametrage actif"
          onClick={() => setActiveView('settings')}
        />
        <StatCard title="Inter-collab." value={stats.internal} subtitle="appels internes" />
        <StatCard title="Attente max" value={formatDuration(stats.maxWait)} subtitle="abandonnes" />
        <StatCard title="Attente moy." value={formatDuration(stats.avgAbandonedWait)} subtitle="abandonnes" />
        <StatCard title="Parole moy." value={formatDuration(stats.avgTalk)} subtitle={`${stats.treated.length} conversations`} />
      </section>

      <Panel title="Courbe par periode">
        <section className="filters">
          <label title={nexMetricHelp('Indicateur courbe')}>
            Indicateur courbe
            <select value={chartMetric} onChange={(event) => setChartMetric(event.target.value as ChartMetric)}>
              {chartMetricOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
        </section>

        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatChartValue(value, chartMetric)} />
            <Tooltip content={<NexChartTooltip metricLabel={selectedMetric} metric={chartMetric} />} />
            <Line type="linear" dataKey="value" name={selectedMetric} dot={{ r: 4 }} activeDot={{ r: 7 }} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </>
  );
}
