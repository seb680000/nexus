import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Upload, Shield, Users, PhoneCall, CalendarDays } from 'lucide-react';
import './styles.css';

type Role = 'superadmin' | 'admin' | 'manager' | 'user';

type CallRow = {
  id: string;
  callTime: Date | null;
  dayKey: string;
  monthKey: string;
  hour: number | null;
  minute: number | null;
  client: string;
  operatorName: string;
  phone: string;
  direction: string;
  status: string;
  callType: string;
  durationSeconds: number;
  raw: Record<string, string>;
};

type PeriodMode = 'day' | 'week' | 'month' | 'quarter' | 'year';

const demoUser = {
  email: 'sebastien.schmitt57@gmail.com',
  role: 'superadmin' as Role,
};

const defaultPermissions = [
  'dashboard',
  'monthly',
  'clients',
  'operators',
  'abandoned',
  'settings',
];

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function pick(row: Record<string, string>, keys: string[]): string {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([name]) => name.toLowerCase().replace(/\s+/g, '') === key.toLowerCase().replace(/\s+/g, ''));
    if (found) return normalize(found[1]);
  }
  return '';
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const cleaned = value.replace(/\./g, '/').replace('T', ' ');
  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, d, m, y, hh = '0', mm = '0', ss = '0'] = match;
  const fullYear = y.length === 2 ? `20${y}` : y;
  return new Date(Number(fullYear), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
}

function parseDuration(value: string): number {
  if (!value) return 0;
  const parts = value.split(':').map((part) => Number(part));
  if (parts.every((part) => Number.isFinite(part))) {
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const num = Number(value.replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const separator = lines[0].includes(';') ? ';' : ',';
  const split = (line: string) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === separator && !quoted) {
        cells.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else current += char;
    }
    cells.push(current.trim().replace(/^"|"$/g, ''));
    return cells;
  };
  const headers = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

function mapRows(rows: Record<string, string>[]): CallRow[] {
  return rows.map((row, index) => {
    const dateValue = pick(row, ['Time', 'Date', 'Call Time', 'StartTime', 'Heure', 'DateHeure']);
    const callTime = parseDate(dateValue);
    const client = pick(row, ['Client', 'Customer', 'Destination', 'ToName', 'NomClient']) || 'Client non identifié';
    const operatorName = pick(row, ['Operator', 'Agent', 'FromName', 'AnsweredBy', 'Operatrice']) || 'Non attribué';
    const status = pick(row, ['Status', 'Etat', 'Result', 'CallStatus']);
    const direction = pick(row, ['Direction', 'Type', 'CallDirection']);
    const callType = pick(row, ['CallType', 'TypeAppel', 'Queue', 'Groupe']);
    const phone = pick(row, ['Phone', 'Number', 'CallerID', 'From', 'Numero']);
    const durationSeconds = parseDuration(pick(row, ['Duration', 'Talking', 'TalkTime', 'Duree']));
    const dayKey = callTime ? callTime.toISOString().slice(0, 10) : 'inconnu';
    const monthKey = callTime ? callTime.toISOString().slice(0, 7) : 'inconnu';
    return {
      id: `${index}-${phone}-${dateValue}`,
      callTime,
      dayKey,
      monthKey,
      hour: callTime?.getHours() ?? null,
      minute: callTime?.getMinutes() ?? null,
      client,
      operatorName,
      phone,
      direction,
      status,
      callType,
      durationSeconds,
      raw: row,
    };
  });
}

function isAbandoned(row: CallRow): boolean {
  const text = `${row.status} ${row.direction} ${row.callType}`.toLowerCase();
  return text.includes('abandon') || text.includes('missed') || text.includes('unanswered') || text.includes('no answer');
}

function isAnswered(row: CallRow): boolean {
  const text = `${row.status} ${row.direction}`.toLowerCase();
  return text.includes('answer') || text.includes('answered') || text.includes('répondu') || row.durationSeconds > 0;
}

function isInternal(row: CallRow): boolean {
  const text = `${row.direction} ${row.callType}`.toLowerCase();
  return text.includes('internal') || text.includes('interne');
}

function isOutbound(row: CallRow): boolean {
  const text = `${row.direction} ${row.callType}`.toLowerCase();
  return text.includes('outbound') || text.includes('sortant');
}

function isPremium(row: CallRow): boolean {
  return `${row.callType} ${row.client}`.toLowerCase().includes('premium');
}

function summarize(rows: CallRow[]) {
  const total = rows.length;
  const abandoned = rows.filter(isAbandoned).length;
  const answered = rows.filter(isAnswered).length;
  const internal = rows.filter(isInternal).length;
  const outbound = rows.filter(isOutbound).length;
  const premiumAbandoned = rows.filter((row) => isAbandoned(row) && isPremium(row)).length;
  const avgDuration = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.durationSeconds, 0) / rows.length) : 0;
  return {
    total,
    answered,
    abandoned,
    internal,
    outbound,
    premiumAbandoned,
    avgDuration,
    answerRate: total ? Math.round((answered / total) * 1000) / 10 : 0,
    abandonRate: total ? Math.round((abandoned / total) * 1000) / 10 : 0,
  };
}

function groupBy<T>(items: T[], keyGetter: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyGetter(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

function App() {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedOperator, setSelectedOperator] = useState('all');
  const [detail, setDetail] = useState<CallRow[] | null>(null);

  const clients = useMemo(() => Array.from(new Set(rows.map((row) => row.client))).sort(), [rows]);
  const operators = useMemo(() => Array.from(new Set(rows.map((row) => row.operatorName))).sort(), [rows]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (selectedClient !== 'all' && row.client !== selectedClient) return false;
    if (selectedOperator !== 'all' && row.operatorName !== selectedOperator) return false;
    return true;
  }), [rows, selectedClient, selectedOperator]);

  const stats = useMemo(() => summarize(filteredRows), [filteredRows]);

  const dailyChart = useMemo(() => {
    const grouped = groupBy(filteredRows, (row) => row.dayKey);
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({
      day: day.slice(5),
      appels: list.length,
      repondus: list.filter(isAnswered).length,
      abandonnes: list.filter(isAbandoned).length,
    }));
  }, [filteredRows]);

  const monthlyChart = useMemo(() => {
    const grouped = groupBy(filteredRows, (row) => row.monthKey);
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, list]) => ({
      month,
      appels: list.length,
      repondus: list.filter(isAnswered).length,
      abandonnes: list.filter(isAbandoned).length,
    }));
  }, [filteredRows]);

  const byClient = useMemo(() => {
    const grouped = groupBy(filteredRows, (row) => row.client);
    return Array.from(grouped.entries()).map(([client, list]) => ({ client, ...summarize(list), rows: list })).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [filteredRows]);

  const byOperator = useMemo(() => {
    const grouped = groupBy(filteredRows, (row) => row.operatorName);
    return Array.from(grouped.entries()).map(([operatorName, list]) => ({ operatorName, ...summarize(list), rows: list })).sort((a, b) => b.answered - a.answered).slice(0, 20);
  }, [filteredRows]);

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = mapRows(parseCsv(text));
    setRows(parsed);
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">Nexus <span>V2</span></div>
        <div className="userBox"><Shield size={18} /> {demoUser.email}<small>{demoUser.role}</small></div>
        <nav>{defaultPermissions.map((item) => <button key={item}>{item}</button>)}</nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <h1>Statistiques appels SALC</h1>
            <p>Version légère : import CSV, KPI, courbes, clients, opératrices et base prête pour multi-utilisateurs.</p>
          </div>
          <label className="uploadButton">
            <Upload size={18} /> Importer export 3CX
            <input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
          </label>
        </header>

        <section className="filters">
          <label>Période<select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as PeriodMode)}><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="quarter">Trimestre</option><option value="year">Année</option></select></label>
          <label>Client<select value={selectedClient} onChange={(event) => setSelectedClient(event.target.value)}><option value="all">Tous</option>{clients.map((client) => <option key={client}>{client}</option>)}</select></label>
          <label>Opératrice<select value={selectedOperator} onChange={(event) => setSelectedOperator(event.target.value)}><option value="all">Toutes</option>{operators.map((operatorName) => <option key={operatorName}>{operatorName}</option>)}</select></label>
          <div className="periodHint"><CalendarDays size={16} /> Mode actif : {periodMode}. Les indicateurs sont recalculés dynamiquement.</div>
        </section>

        <section className="cards">
          <StatCard title="Appels reçus" value={stats.total} onClick={() => setDetail(filteredRows)} />
          <StatCard title="Répondus" value={stats.answered} suffix={`${stats.answerRate}%`} onClick={() => setDetail(filteredRows.filter(isAnswered))} />
          <StatCard title="Abandonnés" value={stats.abandoned} suffix={`${stats.abandonRate}%`} tone="danger" onClick={() => setDetail(filteredRows.filter(isAbandoned))} />
          <StatCard title="Premium abandonnés" value={stats.premiumAbandoned} tone="warning" onClick={() => setDetail(filteredRows.filter((row) => isAbandoned(row) && isPremium(row)))} />
          <StatCard title="Internes" value={stats.internal} onClick={() => setDetail(filteredRows.filter(isInternal))} />
          <StatCard title="Sortants" value={stats.outbound} onClick={() => setDetail(filteredRows.filter(isOutbound))} />
        </section>

        {rows.length === 0 ? <section className="emptyState"><PhoneCall size={32} /><h2>Importer un export 3CX pour démarrer</h2><p>La V2 analyse le fichier immédiatement et prépare les vues dynamiques.</p></section> : null}

        <section className="grid2">
          <Panel title="Courbe par jour">
            <ResponsiveContainer width="100%" height={280}><LineChart data={dailyChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Line type="monotone" dataKey="appels" /><Line type="monotone" dataKey="repondus" /><Line type="monotone" dataKey="abandonnes" /></LineChart></ResponsiveContainer>
          </Panel>
          <Panel title="Vue annuelle / mensuelle">
            <ResponsiveContainer width="100%" height={280}><BarChart data={monthlyChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="appels" /><Bar dataKey="abandonnes" /></BarChart></ResponsiveContainer>
          </Panel>
        </section>

        <section className="grid2">
          <Panel title="Analyse clients">
            <DataTable rows={byClient} columns={[['client', 'Client'], ['total', 'Appels'], ['answered', 'Répondus'], ['abandoned', 'Abandonnés'], ['answerRate', 'Tx réponse %']]} onOpen={(row) => setDetail(row.rows)} />
          </Panel>
          <Panel title="Analyse opératrices">
            <DataTable rows={byOperator} columns={[['operatorName', 'Opératrice'], ['answered', 'Traités'], ['total', 'Total'], ['abandoned', 'Abandonnés'], ['avgDuration', 'Durée moy. s']]} onOpen={(row) => setDetail(row.rows)} />
          </Panel>
        </section>
      </section>

      {detail ? <DetailModal rows={detail} onClose={() => setDetail(null)} /> : null}
    </main>
  );
}

function StatCard({ title, value, suffix, tone, onClick }: { title: string; value: number; suffix?: string; tone?: 'danger' | 'warning'; onClick: () => void }) {
  return <button className={`statCard ${tone ?? ''}`} onClick={onClick}><span>{title}</span><b>{value}</b>{suffix ? <small>{suffix}</small> : null}</button>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function DataTable({ rows, columns, onOpen }: { rows: any[]; columns: [string, string][]; onOpen: (row: any) => void }) {
  return <div className="tableWrap"><table><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Détail</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map(([key]) => <td key={key}>{row[key]}</td>)}<td><button className="small" onClick={() => onOpen(row)}>Ouvrir</button></td></tr>)}</tbody></table></div>;
}

function DetailModal({ rows, onClose }: { rows: CallRow[]; onClose: () => void }) {
  return <div className="modalBackdrop"><div className="modal"><header><h2>Détail des appels</h2><button onClick={onClose}>Fermer</button></header><div className="tableWrap"><table><thead><tr><th>Date</th><th>Client</th><th>Opératrice</th><th>Téléphone</th><th>Statut</th><th>Type</th><th>Durée</th></tr></thead><tbody>{rows.slice(0, 500).map((row) => <tr key={row.id}><td>{row.callTime?.toLocaleString('fr-FR') ?? '-'}</td><td>{row.client}</td><td>{row.operatorName}</td><td>{row.phone}</td><td>{row.status}</td><td>{row.callType}</td><td>{row.durationSeconds}s</td></tr>)}</tbody></table></div></div></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
