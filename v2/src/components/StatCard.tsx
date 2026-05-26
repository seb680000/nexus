type StatCardProps = {
  title: string;
  value: number | string;
  subtitle?: string;
  tone?: 'danger' | 'warning';
  onClick?: () => void;
};

export function StatCard({ title, value, subtitle, tone, onClick }: StatCardProps) {
  return (
    <button className={`statCard ${tone || ''}`} onClick={onClick || (() => {})}>
      <span>{title}</span>
      <b>{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</b>
      {subtitle && <small>{subtitle}</small>}
    </button>
  );
}
