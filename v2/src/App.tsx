import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, PhoneCall, Shield, Upload } from 'lucide-react';
import './styles.css';

type Row = {
  id: string;
  callId: string;
  time: Date | null;
  day: string;
  month: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  ringing: number;
  talking: number;
  wait: number;
  client: string;
  phone: string;
  operator: string;
};

type QueueCall = {
  callId: string;
  day: string;
  month: string;
  client: string;
  phone: string;
  service: 'premium' | 'forfait' | 'autre';
  treated: boolean;
  abandoned: boolean;
  wait: number;
  rows: Row[];
};

const user = { email: 'sebastien.schmitt57@gmail.com', role: 'superadmin' };
const views = ['dashboard', 'monthly', 'clients', 'operators', 'abandoned', 'settings'];

function norm(value: unknown) { return String(value ?? '').trim(); }
function sec(value: string) {
  const p = norm(value).split(':').map(Number);
  if (p.length === 3 && p.every(Number.isFinite)) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2 && p.every(Number.isFinite)) return p[0] * 60 + p[1];
  return Number(norm(value).replace(',', '.')) || 0;
}
function fmt(total: number) {
  const n = Math.max(0, Math.round(total || 0));
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
  return [h, m, s].map(x => String(x).padStart(2, '0')).join(':');
}
function parseDate(value: string) {
  if (!value || value === 'Totals') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function key(date: Date | null) {
  if (!date) return 'inconnu';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function inHours(date: Date | null) {
  if (!date) return false;
  const v = date.getHours() + date.getMinutes() / 60;
  return v >= 8 && v < 18;
}
function splitCsvLine(line: string, separator: string) {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i], n = line[i + 1];
    if (c === '"' && quoted && n === '"') { cur += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === separator && !quoted) { out.push(cur.trim().replace(/^"|"$/g, '')); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim().replace(/^"|"$/g, ''));
  return out;
}
function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [] as Record<string, string>[];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = splitCsvLine(lines[0], sep);
  return lines.slice(1).map(line => Object.fromEntries(splitCsvLine(line, sep).map((cell, i) => [headers[i] || `col${i}`, cell])));
}
function operatorName(value: string) {
  const s = norm(value), l = s.toLowerCase();
  if (!s || l.includes('client premium') || l.includes('client forfait') || l.includes('queue') || l.includes('repondeur') || l.includes('répondeur')) return '';
  if (/\bA\d{1,3}\b/i.test(s) || !/\(\d+\)/.test(s)) return '';
  return s.replace(/\(\d+\)/g, '').split(',').map(x => x.trim()).filter(Boolean).reverse().join(' ');
}
function phoneFrom(value: string) { return norm(value).match(/0\d{6,}/)?.[0] || ''; }
function clientFrom(row: Record<string, string>) {
  const details = row['Call Activity Details'] || '';
  const m = details.match(/A\d+\s+([^()→]+)\s*\((0\d{6,})\)/i) || details.match(/:\s*([^()→]+)\s*\((0\d{6,})\)/i);
  return norm(m?.[1]) || norm(row.From) || 'Client non identifié';
}
function service(row: Row) {
  const t = `${row.to} ${row.from}`.toLowerCase();
  if (t.includes('client premium')) return 'premium' as const;
  if (t.includes('client forfait')) return 'forfait' as const;
  return 'autre' as const;
}
function mapRows(raw: Record<string, string>[]): Row[] {
  return raw.map((r, i) => {
    const time = parseDate(r['Call Time']);
    const ringing = sec(r.Ringing), talking = sec(r.Talking);
    return {
      id: `${i}-${r['Call ID'] || ''}`,
      callId: norm(r['Call ID']) || String(i),
      time,
      day: key(time),
      month: key(time).slice(0, 7),
      from: norm(r.From),
      to: norm(r.To),
      direction: norm(r.Direction),
      status: norm(r.Status),
      ringing,
      talking,
      wait: Math.max(ringing, talking),
      client: clientFrom(r),
      phone: phoneFrom(r.From) || phoneFrom(r['Call Activity Details'] || ''),
      operator: operatorName(r.To) || operatorName(r.From) || 'Non attribué',
    };
  }).filter(r => r.time);
}
function isQueue(r: Row) { return r.direction.toLowerCase() === 'inbound queue'; }
function isWaiting(r: Row) { return r.status.toLowerCase() === 'waiting'; }
function isUnanswered(r: Row) { return r.status.toLowerCase() === 'unanswered'; }
function isAnswered(r: Row) { return r.status.toLowerCase() === 'answered'; }
function isInbound(r: Row) { return r.direction.toLowerCase() === 'inbound'; }
function isOutbound(r: Row) { return r.direction.toLowerCase() === 'outbound'; }
function isInternal(r: Row) { return r.direction.toLowerCase() === 'internal'; }
function queueCalls(rows: Row[]) {
  const map = new Map<string, QueueCall>();
  for (const r of rows) {
    if (!inHours(r.time) || !isQueue(r) || (!isWaiting(r) && !isUnanswered(r))) continue;
    const q = map.get(r.callId) || { callId: r.callId, day: r.day, month: r.month, client: r.client, phone: r.phone, service: service(r), treated: false, abandoned: false, wait: 0, rows: [] };
    if (r.client && r.client !== 'Client non identifié') q.client = r.client;
    if (r.phone && !q.phone) q.phone = r.phone;
    if (q.service === 'autre') q.service = service(r);
    q.wait = Math.max(q.wait, r.wait);
    if (isWaiting(r)) q.treated = true;
    if (isUnanswered(r)) q.abandoned = true;
    q.rows.push(r);
    map.set(r.callId, q);
  }
  return [...map.values()];
}
function rowsOf(calls: QueueCall[]) { return calls.flatMap(c => c.rows); }
function summarize(rows: Row[]) {
  const business = rows.filter(r => inHours(r.time));
  const queue = queueCalls(business);
  const treated = queue.filter(q => q.treated);
  const abandoned = queue.filter(q => !q.treated && q.abandoned);
  const total = treated.length + abandoned.length;
  return {
    queue, treated, abandoned, total,
    waitingNow: 0,
    maxWait: queue.reduce((m, q) => Math.max(m, q.wait), 0),
    premiumAbandoned: abandoned.filter(q => q.service === 'premium').length,
    internal: business.filter(r => isInternal(r) && isAnswered(r)).length,
    outbound: business.filter(r => isOutbound(r) && isAnswered(r) && r.talking >= 10).length,
    answerRate: total ? Math.round(treated.length / total * 1000) / 10 : 0,
    abandonRate: total ? Math.round(abandoned.length / total * 1000) / 10 : 0,
  };
}
function groupBy<T>(items: T[], fn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(fn(item), [...(map.get(fn(item)) || []), item]);
  return map;
}

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [periodMode, setPeriodMode] = useState('month');
  const [client, setClient] = useState('all');
  const [operator, setOperator] = useState('all');
  const [detail, setDetail] = useState<Row[] | null>(null);
  const clients = useMemo(() => [...new Set(rows.map(r => r.client))].filter(Boolean).sort(), [rows]);
  const operators = useMemo(() => [...new Set(rows.map(r => r.operator))].filter(o => o && o !== 'Non attribué').sort(), [rows]);
  const filtered = useMemo(() => rows.filter(r => (client === 'all' || r.client === client) && (operator === 'all' || r.operator === operator)), [rows, client, operator]);
  const stats = useMemo(() => summarize(filtered), [filtered]);
  const daily = useMemo(() => [...groupBy(stats.queue, q => q.day).entries()].sort().map(([day, list]) => ({ day: day.slice(5), appels: list.length, traites: list.filter(q => q.treated).length, abandonnes: list.filter(q => !q.treated && q.abandoned).length })), [stats.queue]);
  const monthly = useMemo(() => [...groupBy(stats.queue, q => q.month).entries()].sort().map(([month, list]) => ({ month, appels: list.length, traites: list.filter(q => q.treated).length, abandonnes: list.filter(q => !q.treated && q.abandoned).length })), [stats.queue]);
  const byClient = useMemo(() => [...groupBy(stats.queue, q => q.client).entries()].map(([label, list]) => ({ label, total: list.length, treated: list.filter(q => q.treated).length, abandoned: list.filter(q => !q.treated && q.abandoned).length, rows: rowsOf(list) })).sort((a, b) => b.total - a.total).slice(0, 20), [stats.queue]);
  const byOperator = useMemo(() => [...groupBy(filtered.filter(r => inHours(r.time) && isInbound(r) && isAnswered(r) && r.operator !== 'Non attribué'), r => r.operator).entries()].map(([label, list]) => ({ label, total: list.length, treated: list.length, avg: list.length ? Math.round(list.reduce((s, r) => s + r.talking, 0) / list.length) : 0, rows: list })).sort((a, b) => b.total - a.total).slice(0, 20), [filtered]);
  async function handleFile(file: File) { setRows(mapRows(parseCsv(await file.text()))); }
  return <main className="appShell"><aside className="sidebar"><div className="brand">Nexus <span>V2</span></div><div className="userBox"><Shield size={18}/>{user.email}<small>{user.role}</small></div><nav>{views.map(v => <button key={v}>{v}</button>)}</nav></aside><section className="content"><header className="topbar"><div><h1>Statistiques appels SALC</h1><p>Base 3CX officielle : 08h00-18h00, Inbound Queue + Waiting / Unanswered.</p></div><label className="uploadButton"><Upload size={18}/> Importer export 3CX<input type="file" accept=".csv,text/csv" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}/></label></header><section className="filters"><label>Période<select value={periodMode} onChange={e => setPeriodMode(e.target.value)}><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="quarter">Trimestre</option><option value="year">Année</option></select></label><label>Client<select value={client} onChange={e => setClient(e.target.value)}><option value="all">Tous</option>{clients.map(c => <option key={c}>{c}</option>)}</select></label><label>Opératrice<select value={operator} onChange={e => setOperator(e.target.value)}><option value="all">Toutes</option>{operators.map(o => <option key={o}>{o}</option>)}</select></label><div className="periodHint"><CalendarDays size={16}/> Les indicateurs sont recalculés dynamiquement.</div></section><section className="cards"><Stat title="En attente d'appels" value={stats.waitingNow} onClick={() => setDetail([])}/><Stat title="Appels traités" value={stats.treated.length} suffix={`${stats.answerRate}%`} onClick={() => setDetail(rowsOf(stats.treated))}/><Stat title="Appels abandonnés" value={stats.abandoned.length} suffix={`${stats.abandonRate}%`} tone="danger" onClick={() => setDetail(rowsOf(stats.abandoned))}/><Stat title="Attente la plus longue" value={fmt(stats.maxWait)} onClick={() => setDetail(rowsOf(stats.queue.filter(q => q.wait === stats.maxWait)))}/><Stat title="Total file" value={stats.total} onClick={() => setDetail(rowsOf(stats.queue))}/><Stat title="Premium abandonnés" value={stats.premiumAbandoned} tone="warning" onClick={() => setDetail(rowsOf(stats.abandoned.filter(q => q.service === 'premium')))}/><Stat title="Internes" value={stats.internal} onClick={() => setDetail(filtered.filter(r => inHours(r.time) && isInternal(r) && isAnswered(r)))}/><Stat title="Sortants" value={stats.outbound} onClick={() => setDetail(filtered.filter(r => inHours(r.time) && isOutbound(r) && isAnswered(r) && r.talking >= 10))}/></section>{!rows.length && <section className="emptyState"><PhoneCall size={32}/><h2>Importer un export 3CX pour démarrer</h2><p>La V2 analyse le fichier immédiatement.</p></section>}<section className="grid2"><Panel title="Courbe par jour"><ResponsiveContainer width="100%" height={280}><LineChart data={daily}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="day"/><YAxis/><Tooltip/><Line type="monotone" dataKey="appels"/><Line type="monotone" dataKey="traites"/><Line type="monotone" dataKey="abandonnes"/></LineChart></ResponsiveContainer></Panel><Panel title="Vue annuelle / mensuelle"><ResponsiveContainer width="100%" height={280}><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month"/><YAxis/><Tooltip/><Bar dataKey="appels"/><Bar dataKey="abandonnes"/></BarChart></ResponsiveContainer></Panel></section><section className="grid2"><Panel title="Analyse clients"><Table rows={byClient} columns={[["label", "Client"], ["total", "Total file"], ["treated", "Traités"], ["abandoned", "Abandonnés"]]} onOpen={r => setDetail(r.rows)}/></Panel><Panel title="Analyse opératrices"><Table rows={byOperator} columns={[["label", "Opératrice"], ["total", "Décrochés"], ["avg", "Durée moy. s"]]} onOpen={r => setDetail(r.rows)}/></Panel></section></section>{detail && <Detail rows={detail} onClose={() => setDetail(null)}/>}</main>;
}
function Stat({ title, value, suffix, tone, onClick }: { title: string; value: number | string; suffix?: string; tone?: 'danger' | 'warning'; onClick: () => void }) { return <button className={`statCard ${tone || ''}`} onClick={onClick}><span>{title}</span><b>{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</b>{suffix && <small>{suffix}</small>}</button>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
function Table({ rows, columns, onOpen }: { rows: any[]; columns: [string, string][]; onOpen: (row: any) => void }) { return <div className="tableWrap"><table><thead><tr>{columns.map(([, l]) => <th key={l}>{l}</th>)}<th>Détail</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{columns.map(([k]) => <td key={k}>{r[k]}</td>)}<td><button className="small" onClick={() => onOpen(r)}>Ouvrir</button></td></tr>)}</tbody></table></div>; }
function Detail({ rows, onClose }: { rows: Row[]; onClose: () => void }) { return <div className="modalBackdrop"><div className="modal"><header><h2>Détail des appels</h2><button onClick={onClose}>Fermer</button></header><div className="tableWrap"><table><thead><tr><th>Date</th><th>Client</th><th>Opératrice</th><th>Téléphone</th><th>Direction</th><th>Statut</th><th>Attente</th><th>Durée</th></tr></thead><tbody>{rows.slice(0, 500).map(r => <tr key={r.id}><td>{r.time?.toLocaleString('fr-FR') || '-'}</td><td>{r.client}</td><td>{r.operator}</td><td>{r.phone}</td><td>{r.direction}</td><td>{r.status}</td><td>{fmt(r.wait)}</td><td>{fmt(r.talking)}</td></tr>)}</tbody></table></div></div></div>; }

createRoot(document.getElementById('root')!).render(<App/>);
