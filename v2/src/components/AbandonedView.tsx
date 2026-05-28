import type { AbandonedReportRow, AbandonedStatusFilter, DurationFilter, Row, Service } from '../types';
import { exportAbandonedCsv, exportAbandonedPdf } from '../utils/exports';
import { isAnswered, isInbound, isInternal, isOutbound, isRealOperator } from '../utils/calls';
import { DataTable } from './DataTable';
import { Panel } from './Panel';

type AbandonedViewProps = {
  rows: AbandonedReportRow[];
  allRows: Row[];
  operators: string[];
  counts: { total: number; premium: number; forfait: number; autre: number; plus5: number; plus10: number; plus30: number; plus60: number };
  family: 'all' | Service;
  setFamily: (value: 'all' | Service) => void;
  duration: DurationFilter;
  setDuration: (value: DurationFilter) => void;
  status: AbandonedStatusFilter;
  setStatus: (value: AbandonedStatusFilter) => void;
  onOpen: (row: AbandonedReportRow) => void;
};

function dayFromDateLabel(value: string) { return String(value || '').slice(0, 8); }
function normalized(value: string) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function hasRecall(row: AbandonedReportRow) { const op = normalized(row.operatorCallback); const user = normalized(row.userCallback); return !op.includes('aucun rappel operatrice trouve') || !user.includes('aucun rappel entrant ulterieur detecte'); }
function parseAbandonedDate(value: string) { const m = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2})h(\d{2})/); return m ? new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), 0, 0) : null; }
function hasUsefulPresence(row: Row) { return isRealOperator(row.operator) && (isAnswered(row) || isInbound(row) || isOutbound(row) || isInternal(row)) && (row.ringing > 0 || row.talking > 0 || isAnswered(row)); }
function rowPresentInLastHour(row: Row, date: Date) { if (!row.time || !hasUsefulPresence(row)) return false; const t = row.time.getTime(); const end = date.getTime(); const start = end - 60 * 60 * 1000; return t >= start && t <= end; }
function presentOperators(row: AbandonedReportRow, allRows: Row[]) { const date = parseAbandonedDate(row.date); if (!date) return []; return [...new Set(allRows.filter((source) => rowPresentInLastHour(source, date)).map((source) => source.operator))].filter(isRealOperator).sort(); }
function assignOperators(rows: any[], allRows: Row[]) { const loads = new Map<string, number>(); return rows.map((row) => { if (hasRecall(row)) return { ...row, assignedCallbackOperator: 'Deja rappele' }; const present = presentOperators(row, allRows); if (!present.length) return { ...row, assignedCallbackOperator: 'Aucune operatrice presente sur les 60 dernieres minutes' }; const assigned = [...present].sort((a, b) => (loads.get(a) || 0) - (loads.get(b) || 0) || a.localeCompare(b))[0]; loads.set(assigned, (loads.get(assigned) || 0) + 1); return { ...row, assignedCallbackOperator: assigned }; }); }
function buildRows(rows: AbandonedReportRow[], allRows: Row[]) { const missed = new Map<string, number>(); const recalled = new Map<string, number>(); for (const row of rows) { const key = `${dayFromDateLabel(row.date)}__${row.label}`; missed.set(key, (missed.get(key) || 0) + 1); if (hasRecall(row)) recalled.set(key, (recalled.get(key) || 0) + 1); } const counted = rows.map((row) => { const key = `${dayFromDateLabel(row.date)}__${row.label}`; const missedDay = missed.get(key) || 1; const recalledDay = recalled.get(key) || 0; return { ...row, missedDay, recalledDay, missedRecalledDay: `${missedDay} / ${recalledDay}`, allMissedRecalled: recalledDay >= missedDay }; }); return assignOperators(counted, allRows); }

export function AbandonedView({ rows, allRows, counts, family, setFamily, duration, setDuration, status, setStatus, onOpen }: AbandonedViewProps) {
  const displayRows = buildRows(rows, allRows);
  return (
    <Panel title="Appels abandonnes">
      <section className="filters">
        <label>Statut<select value={status} onChange={(event) => setStatus(event.target.value as AbandonedStatusFilter)}><option value="all">Tous les statuts</option><option value="toCall">À rappeler</option><option value="operatorDone">Traité opératrice</option><option value="userCalledBack">Utilisateur a déjà rappelé</option><option value="under5">Appel de moins de 5 secondes</option><option value="lostParking">Perdu pendant parking</option><option value="treatedAfterParking">Traité après perte parking</option></select></label>
        <label>Famille<select value={family} onChange={(event) => setFamily(event.target.value as 'all' | Service)}><option value="all">Toutes</option><option value="premium">Premium</option><option value="forfait">Forfait</option><option value="autre">Autres</option></select></label>
        <label>Duree<select value={duration} onChange={(event) => setDuration(event.target.value as DurationFilter)}><option value="all">Toutes</option><option value="gt5">Plus de 5 secondes</option><option value="gt10">Plus de 10 secondes</option><option value="gt30">Plus de 30 secondes</option><option value="gt60">Plus de 60 secondes</option></select></label>
        <div className="periodHint">Total {counts.total} · Premium {counts.premium} · Forfait {counts.forfait} · Autres {counts.autre} · &gt;5s {counts.plus5} · &gt;10s {counts.plus10} · &gt;30s {counts.plus30} · &gt;60s {counts.plus60}</div>
        <button onClick={() => exportAbandonedPdf(displayRows)}>Export PDF</button>
        <button onClick={() => exportAbandonedCsv(displayRows)}>Export Excel</button>
      </section>
      <DataTable rows={displayRows} columns={[["status", "Statut"], ["date", "Date / heure appel"], ["label", "Client"], ["missedRecalledDay", "Appels manqués / rappels jour"], ["assignedCallbackOperator", "Opératrice chargée du rappel"], ["phone", "Telephone"], ["service", "Famille"], ["wait", "Attente"], ["operatorCallback", "Rappel operatrice"], ["userCallback", "Utilisateur a deja rappele"]]} onOpen={onOpen} />
    </Panel>
  );
}
