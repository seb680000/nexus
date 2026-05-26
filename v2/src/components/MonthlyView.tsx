import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartMetric } from '../types';
import { chartMetricOptions, formatChartValue } from './DashboardView';
import { Panel } from './Panel';

type MonthlyViewProps = {
  data: Array<Record<string, string | number>>;
  chartMetric: ChartMetric;
  setChartMetric: (metric: ChartMetric) => void;
};

export function MonthlyView({ data, chartMetric, setChartMetric }: MonthlyViewProps) {
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

      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(value) => formatChartValue(value, chartMetric)} />
          <Tooltip formatter={(value) => [formatChartValue(value, chartMetric), selectedMetric]} />
          <Bar dataKey="value" name={selectedMetric} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
