import type { AbandonedReportRow, DurationFilter, Service } from '../types';
import { exportAbandonedCsv, exportAbandonedPdf } from '../utils/exports';
import { DataTable } from './DataTable';
import { Panel } from './Panel';

type AbandonedViewProps = {
  rows: AbandonedReportRow[];
  counts: {
    total: number;
    premium: number;
    forfait: number;
    autre: number;
    plus5: number;
    plus10: number;
    plus30: number;
    plus60: number;
  };
  family: 'all' | Service;
  setFamily: (value: 'all' | Service) => void;
  duration: DurationFilter;
  setDuration: (value: DurationFilter) => void;
  onOpen: (row: AbandonedReportRow) => void;
};

export function AbandonedView({
  rows,
  counts,
  family,
  setFamily,
  duration,
  setDuration,
  onOpen,
}: AbandonedViewProps) {
  return (
    <Panel title="Appels abandonnes">
      <section className="filters">
        <label>
          Famille
          <select value={family} onChange={(event) => setFamily(event.target.value as 'all' | Service)}>
            <option value="all">Toutes</option>
            <option value="premium">Premium</option>
            <option value="forfait">Forfait</option>
            <option value="autre">Autres</option>
          </select>
        </label>

        <label>
          Duree
          <select value={duration} onChange={(event) => setDuration(event.target.value as DurationFilter)}>
            <option value="all">Toutes</option>
            <option value="gt5">Plus de 5 secondes</option>
            <option value="gt10">Plus de 10 secondes</option>
            <option value="gt30">Plus de 30 secondes</option>
            <option value="gt60">Plus de 60 secondes</option>
          </select>
        </label>

        <div className="periodHint">
          Total {counts.total} · Premium {counts.premium} · Forfait {counts.forfait} · Autres {counts.autre} · &gt;5s {counts.plus5} · &gt;10s {counts.plus10} · &gt;30s {counts.plus30} · &gt;60s {counts.plus60}
        </div>

        <button onClick={() => exportAbandonedPdf(rows)}>Export PDF</button>
        <button onClick={() => exportAbandonedCsv(rows)}>Export Excel</button>
      </section>

      <DataTable
        rows={rows}
        columns={[
          ['status', 'Statut'],
          ['date', 'Date / heure appel'],
          ['label', 'Client'],
          ['phone', 'Telephone'],
          ['service', 'Famille'],
          ['wait', 'Attente'],
          ['operatorCallback', 'Rappel operatrice'],
          ['userCallback', 'Utilisateur a deja rappele'],
        ]}
        onOpen={onOpen}
      />
    </Panel>
  );
}
