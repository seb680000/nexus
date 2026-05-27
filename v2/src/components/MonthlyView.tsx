import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartMetric, DetailItem } from '../types';
import { chartLabelFormatter, chartMetricOptions, formatChartValue, NexChartTooltip, openChartDetails } from './DashboardView';
import { Panel } from './Panel';

type MonthlyViewProps = {
  data: Array<Record<string, any>>;
  chartMetric: ChartMetric;
  setChartMetric: (metric: ChartMetric) => void;
  setDetail: (rows: DetailItem[]) => void;
};

export function MonthlyView({ data, chartMetric, setChartMetric, setDetail }: MonthlyViewProps) {
  const selectedMetric = chartMetricOptions.find((option) => option.key === chartMetric)?.label || 'Total a facturer';

  return (
    <Panel title="Stats mensuelles">
      <section className="filters">
        <label>
          Indicateur courbe
          <select value={chartMetric} onChange={(event) => setChartMetric(event.target.value as ChartMetric)}>
            {chartMetricOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>
      </section>

      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} onClick={(event: any) => openChartDetails(event?.activePayload?.[0]?.payload, setDetail)}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(value) => formatChartValue(value, chartMetric)} />
          <Tooltip content={<NexChartTooltip metricLabel={selectedMetric} metric={chartMetric} />} />
          <Bar dataKey="value" name={selectedMetric} className="clickableChart">
            <LabelList dataKey="value" position="top" formatter={(value: unknown) => chartLabelFormatter(value, chartMetric)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
