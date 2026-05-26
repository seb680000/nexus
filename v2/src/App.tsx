import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, PhoneCall, Shield, Upload } from 'lucide-react';
import './styles.css';

type ViewKey = 'dashboard' | 'monthly' | 'clients' | 'operators' | 'abandoned' | 'settings';
type PeriodMode = 'custom' | 'day' | 'week' | 'month' | 'quarter' | 'year';
type Row = { id: string; callId: string; time: Date | null; day: string; month: string; from: string; to: string; direction: string; status: string; ringing: number; talking: number; client: string; phone: string; operator: string; activity: string };
type CallPath = { callId: string; day: string; month: string; date: Date | null; client: string; phone: string; service: 'premium' | 'forfait' | 'autre'; operator: string; treated: boolean; abandoned: boolean; wait: number; talk: number; rows: Row[] };
type DetailItem = { id: string; date: string; client: string; operator: string; phone: string; step: string; status: string; wait: number; talk: number };
type UserRow = { id: number; email: string; name: string; role: string; status: string; dashboard: boolean; monthly: boolean; clients: boolean; operators: boolean; abandoned: boolean; settings: boolean };

const loggedUser = { email: 'sebastien.schmitt57@gmail.com', role: 'superadmin' };
const views: { key: ViewKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'monthly', label: 'Stats mensuelles' },
  { key: 'clients', label: 'Clients' },
  { key: 'operators', label: 'Operatrices' },
  { key: 'abandoned', label: 'Abandonnes' },
  { key: 'settings', label: 'Parametres' },
];
const blockedNames = ['support', 'voice mail', 'voicemail', 'operateur', 'opérateur', 'repondeur', 'répondeur', 'client premium', 'client forfait', 'queue'];

function norm(value: unknown) { return String(value ?? '').trim(); }
function sec(value: string) {
  const parts = norm(value).split(':').map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
  return Number(norm(value).replace(',', '.')) || 0;
}
function fmt(total: number) {
  const n = Math.max(0, Math.round(total || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return [h, m, s].map((x) => String(x).padStart(2, '0')).join(':');
}
function parseDate(value: string) {
  if (!value || value === 'Totals') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function frDate(date: Date | null) { return date ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'; }
function frDateTime(date: Date | null) { return date ? `${frDate(date)} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '-'; }
function dayKey(date: Date | null) {
  if (!date) return 'inconnu';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function periodLabel(label: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const [y, m, d] = label.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  }
  if (/^\d{4}-\d{2}$/.test(label)) {
    const [y, m] = label.split('-');
    return `${m}/${y.slice(2)}`;
  }
  return label;
}
function inHours(date: Date | null) {
  if (!date) return false;
  const h = date.getHours() + date.getMinutes() / 60;
  return h >= 8 && h < 18;
}
function csvLine(line: string, separator: string) {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    const n = line[i + 1];
    if (c === '"' && quoted && n === '"') { cur += '"'; i += 1; }
    else if (c === '"') quoted = !quoted;
    else if (c === separator && !quoted) { out.push(cur.trim().replace(/^"|"$/g, '')); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim().replace(/^"|"$/g, ''));
  return out;
}
function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [] as Record<string, string>[];
  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = csvLine(lines[0], separator);
  return lines.slice(1).map((line) => Object.fromEntries(csvLine(line, separator).map((cell, i) => [headers[i] || `col${i}`, cell])));
}
function phoneFrom(value: string) { return norm(value).match(/0\d{6,}/)?.[0] || ''; }
function looksLikePhone(value: string) { return /^\+?\d[\d\s.\-]{6,}$/.test(norm(value)); }
function isClientName(value: string) {
  const x = norm(value);
  if (!x || x === 'Client non identifie') return false;
  if (looksLikePhone(x)) return false;
  return /[A-Za-zÀ-ÿ]/.test(x);
}
function cleanName(raw: string) {
  const s = norm(raw).replace(/\(\d+\)/g, '').trim();
  const l = s.toLowerCase();
  if (!s || blockedNames.some((x) => l.includes(x)) || /\bA\d{1,3}\b/i.test(raw)) return '';
  return s.split(',').map((x) => x.trim()).filter(Boolean).reverse().join(' ');
}
function opName(value: string) { return /\(\d+\)/.test(value) ? cleanName(value) : ''; }
function opFromActivity(text: string) {
  const matches = [...text.matchAll(/(?:taken by|replaced by|transferred to)\s+([^>\n]+?\s*\(\d+\))/gi)];
  for (const match of matches.reverse()) {
    const name = cleanName(match[1]);
    if (name) return name;
  }
  return '';
}
function clientFrom(row: Record<string, string>) {
  const details = row['Call Activity Details'] || '';
  const match = details.match(/A\d+\s+([^()]+)\s*\((0\d{6,})\)/i) || details.match(/:\s*([^()]+)\s*\((0\d{6,})\)/i);
  const fromDetails = norm(match?.[1]);
  if (isClientName(fromDetails)) return fromDetails;
  const from = norm(row.From);
  return isClientName(from) ? from : 'Client non identifie';
}
function serviceText(text: string): 'premium' | 'forfait' | 'autre' {
  const l = text.toLowerCase();
  if (l.includes('client premium')) return 'premium';
  if (l.includes('client forfait')) return 'forfait';
  return 'autre';
}
function mapRows(raw: Record<string, string>[]): Row[] {
  return raw.map((r, i) => {
    const time = parseDate(r['Call Time']);
    const activity = norm(r['Call Activity Details']);
    return {
      id: `${i}-${r['Call ID'] || ''}`,
      callId: norm(r['Call ID']) || String(i),
      time,
      day: dayKey(time),
      month: dayKey(time).slice(0, 7),
      from: norm(r.From),
      to: norm(r.To),
      direction: norm(r.Direction),
      status: norm(r.Status),
      ringing: sec(r.Ringing),
      talking: sec(r.Talking),
      client: clientFrom(r),
      phone: phoneFrom(r.From) || phoneFrom(activity),
      operator: opName(r.To) || opName(r.From) || opFromActivity(activity),
      activity,
    };
  }).filter((r) => r.time);
}
function isQueue(r: Row) { return r.direction.toLowerCase() === 'inbound queue'; }
function isWaiting(r: Row) { return r.status.toLowerCase() === 'waiting'; }
function isUnanswered(r: Row) { return r.status.toLowerCase() === 'unanswered'; }
function isAnswered(r: Row) { return r.status.toLowerCase() === 'answered'; }
function isOutbound(r: Row) { return r.direction.toLowerCase() === 'outbound'; }
function isInternal(r: Row) { return r.direction.toLowerCase() === 'internal'; }
function groupBy<T>(items: T[], fn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(fn(item), [...(map.get(fn(item)) || []), item]);
  return map;
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x; }
function periodFilter(date: Date | null, mode: PeriodMode, anchor: Date | null, customStart: string, customEnd: string) {
  if (!date || !anchor) return false;
  if (mode === 'custom') {
    const s = customStart ? new Date(customStart) : new Date(anchor);
    const e = customEnd ? new Date(customEnd) : new Date(anchor);
    s.setHours(0, 1, 0, 0);
    e.setHours(23, 0, 0, 0);
    return date >= s && date <= e;
  }
  if (mode === 'day') return dayKey(date) === dayKey(anchor);
  if (mode === 'week') { const s = startOfWeek(anchor); const e = addDays(s, 7); return date >= s && date < e; }
  if (mode === 'month') return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
  if (mode === 'quarter') return date.getFullYear() === anchor.getFullYear() && Math.floor(date.getMonth() / 3) === Math.floor(anchor.getMonth() / 3);
  return date.getFullYear() === anchor.getFullYear();
}
function buildCalls(rows: Row[]) {
  const calls: CallPath[] = [];
  for (const [callId, list] of groupBy(rows.filter((r) => inHours(r.time)), (r) => r.callId)) {
    const sorted = [...list].sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0));
    const queueRows = sorted.filter((r) => isQueue(r) && (isWaiting(r) || isUnanswered(r)));
    if (!queueRows.length) continue;
    const answeredRows = sorted.filter((r) => r.direction.toLowerCase() === 'inbound' && isAnswered(r));
    const operator = answeredRows.map((r) => r.operator).find(Boolean) || sorted.map((r) => r.operator).find(Boolean) || opFromActivity(sorted.map((r) => r.activity).join(' ')) || 'Non identifie';
    const treated = queueRows.some(isWaiting);
    const abandoned = !treated && queueRows.some(isUnanswered);
    const text = sorted.map((r) => `${r.to} ${r.from} ${r.activity}`).join(' ');
    calls.push({
      callId,
      day: queueRows[0].day,
      month: queueRows[0].month,
      date: queueRows[0].time,
      client: queueRows.find((r) => isClientName(r.client))?.client || sorted.find((r) => isClientName(r.client))?.client || 'Client non identifie',
      phone: sorted.map((r) => r.phone).find(Boolean) || '',
      service: serviceText(text),
      operator,
      treated,
      abandoned,
      wait: queueRows.reduce((s, r) => s + Math.max(r.ringing, r.talking), 0),
      talk: answeredRows.reduce((s, r) => s + r.talking, 0),
      rows: sorted,
    });
  }
  return calls;
}
function callDetails(calls: CallPath[]): DetailItem[] {
  return calls.flatMap((c) => {
    const base = { client: c.client, operator: c.operator, phone: c.phone };
    const items: DetailItem[] = [{ id: `${c.callId}-wait`, date: frDateTime(c.date), ...base, step: 'File attente 3CX', status: c.abandoned && !c.treated ? 'Abandonne' : 'Transfere', wait: c.wait, talk: 0 }];
    if (c.talk > 0) items.push({ id: `${c.callId}-talk`, date: frDateTime(c.date), ...base, step: 'Conversation operatrice', status: 'Answered', wait: 0, talk: c.talk });
    if (c.abandoned && !c.treated) items.push({ id: `${c.callId}-lost`, date: frDateTime(c.date), ...base, step: 'Fin appel', status: 'Unanswered', wait: 0, talk: 0 });
    return items;
  });
}
function outboundDetails(rows: Row[]): DetailItem[] {
  return rows.filter((r) => isOutbound(r) && isAnswered(r) && r.talking >= 10).map((r) => ({ id: r.id, date: frDateTime(r.time), client: r.client, operator: r.operator || 'Non identifie', phone: r.phone, step: 'Appel sortant', status: r.status, wait: 0, talk: r.talking }));
}
function summarize(calls: CallPath[], raw: Row[]) {
  const treated = calls.filter((q) => q.treated);
  const abandoned = calls.filter((q) => q.abandoned);
  const total = treated.length + abandoned.length;
  const business = raw.filter((r) => inHours(r.time));
  const outboundRows = business.filter((r) => isOutbound(r) && isAnswered(r) && r.talking >= 10);
  return { calls, treated, abandoned, total, waitingNow: 0, maxWait: calls.reduce((m, q) => Math.max(m, q.wait), 0), premiumAbandoned: abandoned.filter((q) => q.service === 'premium').length, internal: business.filter((r) => isInternal(r) && isAnswered(r)).length, outbound: outboundRows.length, outboundRows, answerRate: total ? Math.round((treated.length / total) * 1000) / 10 : 0, abandonRate: total ? Math.round((abandoned.length / total) * 1000) / 10 : 0 };
}

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('custom');
  const [client, setClient] = useState('all');
  const [selectedOperators, setSelectedOperators] = useState<string[]>(['all']);
  const [detail, setDetail] = useState<DetailItem[] | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [users, setUsers] = useState<UserRow[]>([{ id: 1, email: 'sebastien.schmitt57@gmail.com', name: 'Sebastien Schmitt', role: 'superadmin', status: 'active', dashboard: true, monthly: true, clients: true, operators: true, abandoned: true, settings: true }]);
  const [newEmail, setNewEmail] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const allCalls = useMemo(() => buildCalls(rows), [rows]);
  const anchor = useMemo(() => allCalls.map((c) => c.date).filter(Boolean).sort((a, b) => (b!.getTime() - a!.getTime()))[0] || null, [allCalls]);
  const defaultDay = anchor ? dayKey(anchor) : '';
  const effectiveStart = customStart || defaultDay;
  const effectiveEnd = customEnd || defaultDay;
  const periodCalls = useMemo(() => allCalls.filter((c) => periodFilter(c.date, periodMode, anchor, effectiveStart, effectiveEnd)), [allCalls, periodMode, anchor, effectiveStart, effectiveEnd]);
  const clients = useMemo(() => [...new Set(periodCalls.map((q) => q.client))].filter(isClientName).sort(), [periodCalls]);
  const operators = useMemo(() => [...new Set(periodCalls.map((q) => q.operator))].filter((o) => o && o !== 'Non identifie').sort(), [periodCalls]);
  const filteredCalls = useMemo(() => periodCalls.filter((q) => (client === 'all' || q.client === client) && (selectedOperators.includes('all') || selectedOperators.includes(q.operator))), [periodCalls, client, selectedOperators]);
  const filteredRows = useMemo(() => filteredCalls.flatMap((c) => c.rows), [filteredCalls]);
  const stats = useMemo(() => summarize(filteredCalls, filteredRows), [filteredCalls, filteredRows]);
  const chartData = useMemo(() => [...groupBy(filteredCalls, (q) => (periodMode === 'day' || periodMode === 'custom' ? q.day : q.month)).entries()].sort().map(([label, list]) => ({ month: periodLabel(label), appels: list.length, traites: list.filter((q) => q.treated).length, abandonnes: list.filter((q) => q.abandoned).length })), [filteredCalls, periodMode]);
  const byClient = useMemo(() => [...groupBy(filteredCalls.filter((q) => isClientName(q.client)), (q) => q.client).entries()].map(([label, list]) => ({ label, total: list.length, treated: list.filter((q) => q.treated).length, abandoned: list.filter((q) => q.abandoned).length, wait: fmt(list.reduce((s, q) => s + q.wait, 0)), talk: fmt(list.reduce((s, q) => s + q.talk, 0)), details: callDetails(list) })).sort((a, b) => b.total - a.total), [filteredCalls]);
  const byOperator = useMemo(() => [...groupBy(filteredCalls.filter((q) => q.treated), (q) => q.operator).entries()].map(([label, list]) => ({ label, total: list.length, wait: fmt(list.reduce((s, q) => s + q.wait, 0)), talk: fmt(list.reduce((s, q) => s + q.talk, 0)), avg: list.length ? fmt(list.reduce((s, q) => s + q.talk, 0) / list.length) : '00:00:00', details: callDetails(list) })).sort((a, b) => b.total - a.total), [filteredCalls]);

  async function handleFile(file: File) { setRows(mapRows(parseCsv(await file.text()))); setPeriodMode('custom'); setCustomStart(''); setCustomEnd(''); }
  function toggleOperator(op: string) {
    if (op === 'all') { setSelectedOperators(['all']); return; }
    const base = selectedOperators.filter((x) => x !== 'all');
    const next = base.includes(op) ? base.filter((x) => x !== op) : [...base, op];
    setSelectedOperators(next.length ? next : ['all']);
  }
  function addUser() {
    if (!newEmail.trim()) return;
    setUsers([...users, { id: Date.now(), email: newEmail.trim(), name: 'Nouvel utilisateur', role: 'user', status: 'active', dashboard: true, monthly: false, clients: false, operators: false, abandoned: false, settings: false }]);
    setNewEmail('');
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">Nexus <span>V2</span></div>
        <div className="userBox"><Shield size={18} />{loggedUser.email}<small>{loggedUser.role}</small></div>
        <nav>{views.map((v) => <button key={v.key} className={activeView === v.key ? 'activeNav' : ''} onClick={() => setActiveView(v.key)}>{v.label}</button>)}</nav>
      </aside>
      <section className="content">
        <header className="topbar">
          <div><h1>{views.find((v) => v.key === activeView)?.label}</h1><p>Periode active : {periodMode}. Date de reference : {frDate(anchor)}.</p></div>
          <label className="uploadButton"><Upload size={18} /> Importer export 3CX<input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} /></label>
        </header>
        <section className="filters">
          <label>Periode<select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}><option value="custom">Personnalise</option><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="quarter">Trimestre</option><option value="year">Annee</option></select></label>
          {periodMode === 'custom' && <><label>Debut<input type="date" value={effectiveStart} onChange={(e) => setCustomStart(e.target.value)} /></label><label>Fin<input type="date" value={effectiveEnd} onChange={(e) => setCustomEnd(e.target.value)} /></label></>}
          <label>Client<select value={client} onChange={(e) => setClient(e.target.value)}><option value="all">Tous</option>{clients.map((c) => <option key={c}>{c}</option>)}</select></label>
          <div className="operatorFilter"><span>Operatrice</span><div className="operatorBox"><label><input type="checkbox" checked={selectedOperators.includes('all')} onChange={() => toggleOperator('all')} /> Toutes</label>{operators.map((o) => <label key={o}><input type="checkbox" checked={!selectedOperators.includes('all') && selectedOperators.includes(o)} onChange={() => toggleOperator(o)} /> {o}</label>)}</div></div>
          <div className="periodHint"><CalendarDays size={16} /> Un clic coche ou decoche une operatrice.</div>
        </section>
        {activeView === 'dashboard' && <Dashboard stats={stats} calls={filteredCalls} chartData={chartData} setDetail={setDetail} />}
        {activeView === 'monthly' && <Monthly data={chartData} />}
        {activeView === 'clients' && <Panel title="Analyse clients"><Table rows={byClient} columns={[["label", "Client"], ["total", "Total"], ["treated", "Traites"], ["abandoned", "Abandonnes"], ["wait", "Attente"], ["talk", "Parole"]]} onOpen={(r) => setDetail(r.details)} /></Panel>}
        {activeView === 'operators' && <Panel title="Analyse operatrices"><Table rows={byOperator} columns={[["label", "Operatrice"], ["total", "Appels"], ["wait", "Attente"], ["talk", "Parole"], ["avg", "Moyenne"]]} onOpen={(r) => setDetail(r.details)} /></Panel>}
        {activeView === 'abandoned' && <Panel title="Appels abandonnes"><Table rows={filteredCalls.filter((q) => q.abandoned).map((q) => ({ label: q.client, operator: q.operator, phone: q.phone, service: q.service, wait: fmt(q.wait), details: callDetails([q]) }))} columns={[["label", "Client"], ["operator", "Operatrice"], ["phone", "Telephone"], ["service", "Type"], ["wait", "Attente"]]} onOpen={(r) => setDetail(r.details)} /></Panel>}
        {activeView === 'settings' && <Settings users={users} setUsers={setUsers} newEmail={newEmail} setNewEmail={setNewEmail} addUser={addUser} />}
        {!rows.length && <section className="emptyState"><PhoneCall size={32} /><h2>Importer un export 3CX pour demarrer</h2><p>La V2 analyse le fichier immediatement.</p></section>}
      </section>
      {detail && <Detail rows={detail} onClose={() => setDetail(null)} />}
    </main>
  );
}

function Dashboard({ stats, calls, chartData, setDetail }: { stats: ReturnType<typeof summarize>; calls: CallPath[]; chartData: any[]; setDetail: (rows: DetailItem[]) => void }) {
  const daily = [...groupBy(calls, (q) => q.day).entries()].sort().map(([day, list]) => ({ day: periodLabel(day), appels: list.length, traites: list.filter((q) => q.treated).length, abandonnes: list.filter((q) => q.abandoned).length }));
  return <><section className="cards"><Stat title="En attente d'appels" value={stats.waitingNow} onClick={() => setDetail([])} /><Stat title="Appels traites" value={stats.treated.length} suffix={`${stats.answerRate}%`} onClick={() => setDetail(callDetails(stats.treated))} /><Stat title="Appels abandonnes" value={stats.abandoned.length} suffix={`${stats.abandonRate}%`} tone="danger" onClick={() => setDetail(callDetails(stats.abandoned))} /><Stat title="Attente la plus longue" value={fmt(stats.maxWait)} onClick={() => setDetail(callDetails(stats.calls.filter((q) => q.wait === stats.maxWait)))} /><Stat title="Total file" value={stats.total} onClick={() => setDetail(callDetails(stats.calls))} /><Stat title="Premium abandonnes" value={stats.premiumAbandoned} tone="warning" onClick={() => setDetail(callDetails(stats.abandoned.filter((q) => q.service === 'premium')))} /><Stat title="Internes" value={stats.internal} onClick={() => setDetail([])} /><Stat title="Sortants" value={stats.outbound} onClick={() => setDetail(outboundDetails(stats.outboundRows))} /></section><section className="grid2"><Panel title="Courbe par periode"><ResponsiveContainer width="100%" height={280}><LineChart data={daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Line type="monotone" dataKey="appels" /><Line type="monotone" dataKey="traites" /><Line type="monotone" dataKey="abandonnes" /></LineChart></ResponsiveContainer></Panel><Panel title="Vue periode"><ResponsiveContainer width="100%" height={280}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="appels" /><Bar dataKey="abandonnes" /></BarChart></ResponsiveContainer></Panel></section></>;
}
function Monthly({ data }: { data: any[] }) { return <Panel title="Stats mensuelles"><ResponsiveContainer width="100%" height={360}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="appels" /><Bar dataKey="traites" /><Bar dataKey="abandonnes" /></BarChart></ResponsiveContainer></Panel>; }
function Settings({ users, setUsers, newEmail, setNewEmail, addUser }: { users: UserRow[]; setUsers: (u: UserRow[]) => void; newEmail: string; setNewEmail: (v: string) => void; addUser: () => void }) {
  function update(id: number, key: keyof UserRow, value: any) { setUsers(users.map((u) => u.id === id ? { ...u, [key]: value } : u)); }
  return <Panel title="Parametres utilisateurs"><div className="settingsActions"><input placeholder="email utilisateur" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /><button onClick={addUser}>Creer utilisateur</button></div><Table rows={users.map((u) => ({ ...u, actions: 'Supprimer' }))} columns={[["email", "Email"], ["name", "Nom"], ["role", "Role"], ["status", "Statut"]]} onOpen={(r) => setUsers(users.filter((u) => u.id !== r.id))} /><div className="tableWrap"><table><thead><tr><th>Utilisateur</th>{views.map((v) => <th key={v.key}>{v.label}</th>)}</tr></thead><tbody>{users.map((u) => <tr key={u.id}><td>{u.email}</td>{views.map((v) => <td key={v.key}><input type="checkbox" checked={Boolean((u as any)[v.key])} onChange={(e) => update(u.id, v.key as keyof UserRow, e.target.checked)} /></td>)}</tr>)}</tbody></table></div></Panel>;
}
function Stat({ title, value, suffix, tone, onClick }: { title: string; value: number | string; suffix?: string; tone?: 'danger' | 'warning'; onClick: () => void }) { return <button className={`statCard ${tone || ''}`} onClick={onClick}><span>{title}</span><b>{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</b>{suffix && <small>{suffix}</small>}</button>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
function Table({ rows, columns, onOpen }: { rows: any[]; columns: [string, string][]; onOpen: (row: any) => void }) { return <div className="tableWrap"><table><thead><tr>{columns.map(([, l]) => <th key={l}>{l}</th>)}<th>Detail</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{columns.map(([k]) => <td key={k}>{r[k]}</td>)}<td><button className="small" onClick={() => onOpen(r)}>{r.actions || 'Ouvrir'}</button></td></tr>)}</tbody></table></div>; }
function Detail({ rows, onClose }: { rows: DetailItem[]; onClose: () => void }) { return <div className="modalBackdrop"><div className="modal"><header><h2>Detail du parcours appel</h2><button onClick={onClose}>Fermer</button></header><div className="tableWrap"><table><thead><tr><th>Date</th><th>Client</th><th>Operatrice</th><th>Telephone</th><th>Etape</th><th>Statut</th><th>Attente</th><th>Parole</th></tr></thead><tbody>{rows.slice(0, 500).map((r) => <tr key={r.id}><td>{r.date}</td><td>{r.client}</td><td>{r.operator}</td><td>{r.phone}</td><td>{r.step}</td><td>{r.status}</td><td>{fmt(r.wait)}</td><td>{fmt(r.talk)}</td></tr>)}</tbody></table></div></div></div>; }

createRoot(document.getElementById('root')!).render(<App />);
