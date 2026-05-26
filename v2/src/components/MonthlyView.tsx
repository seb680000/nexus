import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Panel } from './Panel';

type MonthlyViewProps = {
  data: Array<Record<string, string | number>>;
};

export function MonthlyView({ data }: MonthlyViewProps) {
  return (
    <Panel title="Stats mensuelles">
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="total" name="Total entrants" />
          <Bar dataKey="traites" name="Traites" />
          <Bar dataKey="abandonnes" name="Abandonnes" />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
