import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, PhoneCall, Shield, Upload } from 'lucide-react';
import './styles.css';

type ViewKey = 'dashboard' | 'monthly' | 'clients' | 'operators' | 'abandoned' | 'settings';
type PeriodMode = 'custom' | 'day' | 'week' | 'month' | 'quarter' | 'year';
type Service = 'premium' | 'forfait' | 'autre';
type DurationFilter = 'all' | 'gt5' | 'gt10' | 'gt30' | 'gt60';
type Row = { id: string; callId: string; time: Date | null; day: string; month: string; from: string; to: string; direction: string; status: string; ringing: number; talking: number; client: string; phone: string; operator: string; activity: string };
type CallPath = { callId: string; day: string; month: string; date: Date | null; client: string; phone: string; service: Service; operator: string; treated: boolean; abandoned: boolean; wait: number; talk: number; rows: Row[] };
type DetailItem = { id: string; date: string; client: string; operator: string; phone: string; step: string; status: string; wait: number; talk: number };
type UserRow = { id: number; email: string; name: string; role: string; status: string; dashboard: boolean; monthly: boolean; clients: boolean; operators: boolean; abandoned: boolean; settings: boolean };
type CallbackSettings = { families: Service[]; minAbandon: number; minCallback: number };
type AbandonedReportRow = { date: string; label: string; phone: string; service: Service; wait: string; waitSec: number; status: string; operatorCallback: string; userCallback: string; details: DetailItem[] };

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
const services: Service[] = ['premium', 'forfait', 'autre'];

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
  if (h === 0) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}
function fmtClock(total: number) {
  const n = Math.max(0, Math.round(total || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return [h, m, s].map((x) => String(x).padStart(2, '0')).join(':');
}
function parseDate(value: string) { if (!value || value === 'Totals') return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
function frDate(date: Date | null) { return date ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'; }
function frTime(date: Date | null) { return date ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-'; }
function frDateHour(date: Date | null) { return date ? `${frDate(date)} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')}` : '-'; }
function frDateTime(date: Date | null) { return date ? `${frDate(date)} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '-'; }
function dayKey(date: Date | null) { if (!date) return 'inconnu'; return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function periodLabel(label: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) { const [y, m, d] = label.split('-'); return `${d}/${m}/${y.slice(2)}`; }
  if (/^\d{4}-\d{2}$/.test(label)) { const [y, m] = label.split('-'); return `${m}/${y.slice(2)}`; }
  return label;
}
function inHours(date: Date | null) { if (!date) return false; const h = date.getHours() + date.getMinutes() / 60; return h >= 8 && h < 18; }
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
}\nfunction phoneFrom(value: string) { return norm(value).match(/0\d{6,}/)?.[0] || ''; }
function looksLikePhone(value: string) { return /^\+?\d[\d\s.\-]{6,}$/.test(norm(value)); }
function isClientName(value: string) { const x = norm(value); return Boolean(x && x !== 'Client non identifie' && !looksLikePhone(x) && /[A-Za-zÀ-ÿ]/.test(x)); }
function cleanName(raw: string) {
  const s = norm(raw).replace(/\(\d+\)/g, '').trim();
  const l = s.toLowerCase();
  if (!s || blockedNames.some((x) => l.includes(x)) || /\bA\d{1,3}\b/i.test(raw)) return '';
  return s.split(',').map((x) => x.trim()).filter(Boolean).reverse().join(' ');
}
function opName(value: string) { return /\(\d+\)/.test(value) ? cleanName(value) : ''; }
function opFromActivity(text: string) {
  const matches = [...text.matchAll(/(?:taken by|replaced by|transferred to)\s+([^>\n]+?\s*\(\d+\))/gi)];
  for (const match of matches.reverse()) { const name = cleanName(match[1]); if (name) return name; }
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
function serviceText(text: string): Service { const l = text.toLowerCase(); if (l.includes('client premium')) return 'premium'; if (l.includes('client forfait')) return 'forfait'; return 'autre'; }
function mapRows(raw: Record<string, string>[]): Row[] {
  return raw.map((r, i) => {
    const time = parseDate(r['Call Time']);
    const activity = norm(r['Call Activity Details']);
    return { id: `${i}-${r['Call ID'] || ''}`, callId: norm(r['Call ID']) || String(i), time, day: dayKey(time), month: dayKey(time).slice(0, 7), from: norm(r.From), to: norm(r.To), direction: norm(r.Direction), status: norm(r.Status), ringing: sec(r.Ringing), talking: sec(r.Talking), client: clientFrom(r), phone: phoneFrom(r.From) || phoneFrom(activity), operator: opName(r.To) || opName(r.From) || opFromActivity(activity), activity };
  }).filter((r) => r.time);
}
function isQueue(r: Row) { return r.direction.toLowerCase() === 'inbound queue'; }
function isWaiting(r: Row) { return r.status.toLowerCase() === 'waiting'; }
function isUnanswered(r: Row) { return r.status.toLowerCase() === 'unanswered'; }
function isAnswered(r: Row) { return r.status.toLowerCase() === 'answered'; }
function isInbound(r: Row) { return r.direction.toLowerCase() === 'inbound'; }
function isOutbound(r: Row) { return r.direction.toLowerCase() === 'outbound'; }
function isInternal(r: Row) { return r.direction.toLowerCase() === 'internal'; }
function isOperatorBusy(row: Row) { const t = `${row.status} ${row.activity}`.toLowerCase(); return t.includes('busy') || t.includes('already') || t.includes('déjà') || t.includes('deja'); }
function isOperatorProbe(row: Row) { return isInbound(row) && Boolean(row.operator) && !isOperatorBusy(row) && (row.ringing > 0 || isAnswered(row)); }
function groupBy<T>(items: T[], fn: (item: T) => string) { const map = new Map<string, T[]>(); for (const item of items) map.set(fn(item), [...(map.get(fn(item)) || []), item]); return map; }
function startOfWeek(d: Date) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - day); return x; }
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x; }
function periodFilter(date: Date | null, mode: PeriodMode, anchor: Date | null, customStart: string, customEnd: string) {
  if (!date || !anchor) return false;
  if (mode === 'custom') { const s = customStart ? new Date(customStart) : new Date(anchor); const e = customEnd ? new Date(customEnd) : new Date(anchor); s.setHours(0, 1, 0, 0); e.setHours(23, 0, 0, 0); return date >= s && date <= e; }
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
    const answeredRows = sorted.filter((r) => isInbound(r) && isAnswered(r));
    const operator = answeredRows.map((r) => r.operator).find(Boolean) || sorted.map((r) => r.operator).find(Boolean) || opFromActivity(sorted.map((r) => r.activity).join(' ')) || 'Non identifie';
    const treated = queueRows.some(isWaiting);
    const abandoned = !treated && queueRows.some(isUnanswered);
    const text = sorted.map((r) => `${r.to} ${r.from} ${r.activity}`).join(' ');
    calls.push({ callId, day: queueRows[0].day, month: queueRows[0].month, date: queueRows[0].time, client: queueRows.find((r) => isClientName(r.client))?.client || sorted.find((r) => isClientName(r.client))?.client || 'Client non identifie', phone: sorted.map((r) => r.phone).find(Boolean) || '', service: serviceText(text), operator, treated, abandoned, wait: queueRows.reduce((s, r) => s + Math.max(r.ringing, r.talking), 0), talk: answeredRows.reduce((s, r) => s + r.talking, 0), rows: sorted });
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
function outboundDetails(rows: Row[]): DetailItem[] { return rows.filter((r) => isOutbound(r) && isAnswered(r) && r.talking >= 10).map((r) => ({ id: r.id, date: frDateTime(r.time), client: r.client, operator: r.operator || 'Non identifie', phone: r.phone, step: 'Appel sortant', status: r.status, wait: 0, talk: r.talking })); }
function isDurationMatch(seconds: number, filter: DurationFilter) { if (filter === 'gt5') return seconds > 5; if (filter === 'gt10') return seconds > 10; if (filter === 'gt30') return seconds > 30; if (filter === 'gt60') return seconds > 60; return true; }
function getOperatorCallback(a: CallPath, outboundRows: Row[], minCallback: number) {
  if (!a.phone || !a.date) return null;
  const found = outboundRows.find((r) => r.phone === a.phone && r.time && r.time > a.date && r.talking >= minCallback);
  return found ? { operator: found.operator || 'Non identifie', time: found.time, duration: found.talking } : null;
}
function getUserCallback(a: CallPath, allRows: Row[]) {
  if (!a.phone || !a.date) return null;
  const found = allRows.find((r) => isInbound(r) && isAnswered(r) && r.phone === a.phone && r.time && r.time > a.date);
  return found ? { operator: found.operator || 'Non identifie', time: found.time, duration: found.talking } : null;
}
function statusForAbandon(a: CallPath, operatorCb: ReturnType<typeof getOperatorCallback>, userCb: ReturnType<typeof getUserCallback>) {
  if (a.wait < 5) return 'Appel de moins de 5 secondes';
  if (operatorCb && userCb) return 'Traite + rappel utilisateur';
  if (operatorCb) return 'Traite';
  if (userCb) return 'Utilisateur a deja rappele';
  return 'A rappeler';
}
function summarize(calls: CallPath[], raw: Row[], callback: CallbackSettings) {
  const treated = calls.filter((q) => q.treated);
  const abandoned = calls.filter((q) => q.abandoned);
  const total = treated.length + abandoned.length;
  const business = raw.filter((r) => inHours(r.time));
  const outboundRows = business.filter((r) => isOutbound(r) && isAnswered(r) && r.talking >= 10);
  const eligibleAbandoned = abandoned.filter((q) => callback.families.includes(q.service) && q.wait > callback.minAbandon);
  const operatorCallbacks = new Map<string, ReturnType<typeof getOperatorCallback>>();
  const userCallbacks = new Map<string, ReturnType<typeof getUserCallback>>();
  for (const a of abandoned) {
    operatorCallbacks.set(a.callId, getOperatorCallback(a, outboundRows, callback.minCallback));
    userCallbacks.set(a.callId, getUserCallback(a, business));
  }
  const callbacksDone = eligibleAbandoned.filter((a) => operatorCallbacks.get(a.callId)).length;
  const callbacksRemaining = eligibleAbandoned.filter((a) => !operatorCallbacks.get(a.callId) && !userCallbacks.get(a.callId)).length;
  const abandonedOver5 = abandoned.filter((q) => q.wait > 5);
  const premiumOver5 = abandonedOver5.filter((q) => q.service === 'premium').length;
  const forfaitOver5 = abandonedOver5.filter((q) => q.service === 'forfait').length;
  const avgAbandonedWait = abandoned.length ? abandoned.reduce((s, q) => s + q.wait, 0) / abandoned.length : 0;
  const avgTalk = treated.length ? treated.reduce((s, q) => s + q.talk, 0) / treated.length : 0;
  return { calls, treated, abandoned, total, maxWait: abandoned.reduce((m, q) => Math.max(m, q.wait), 0), avgAbandonedWait, avgTalk, abandonedOver5: abandonedOver5.length, premiumOver5, forfaitOver5, premiumAbandoned: abandoned.filter((q) => q.service === 'premium').length, internal: business.filter((r) => isInternal(r) && isAnswered(r)).length, outbound: outboundRows.length, outboundRows, operatorCallbacks, userCallbacks, callbacksDone, callbacksRemaining, invoiceTotal: treated.length + callbacksDone + outboundRows.length, answerRate: total ? Math.round((treated.length / total) * 100) : 0, abandonRate: total ? Math.round((abandoned.length / total) * 100) : 0 };
}
function dateRangeLabel(rows: Row[]) { const dates = rows.map((r) => r.time).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime()); if (!dates.length) return '-'; return `${frDate(dates[0])} au ${frDate(dates[dates.length - 1])}`; }
function uniqueDays(rows: Row[]) { return new Set(rows.map((r) => r.day).filter((x) => x !== 'inconnu')).size; }
function exportCsv(rows: AbandonedReportRow[]) {
  const header = ['Date heure appel', 'Statut', 'Client', 'Telephone', 'Famille', 'Duree attente', 'Rappel operatrice', 'Utilisateur a deja rappele'];
  const body = rows.map((r) => [r.date, r.status, r.label, r.phone, r.service, r.wait, r.operatorCallback, r.userCallback]);
  const csv = [header, ...body].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `appels_abandonnes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
function exportPdf(rows: AbandonedReportRow[]) {
  const htmlRows = rows.map((r) => `<tr><td>${r.status}</td><td>${r.date}</td><td>${r.label}<br/>${r.phone}</td><td>${r.wait}</td><td>${r.service}</td><td>${r.operatorCallback}</td><td>${r.userCallback}</td></tr>`).join('');
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<html><head><title>Appels abandonnes rappels</title><style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:22px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}th{background:#f1f5f9}</style></head><body><h1>Appels abandonnes / rappels sortants</h1><p>Export genere depuis Nexus V2</p><table><thead><tr><th>Statut</th><th>Date / heure appel</th><th>Appelant / client</th><th>Duree attente</th><th>Type</th><th>Rappel operatrice</th><th>Utilisateur a deja rappele</th></tr></thead><tbody>${htmlRows}</tbody></table></body></html>`);
  win.document.close();
  win.print();
}
type DashboardStats = ReturnType<typeof summarize>;

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
  const [abandonedFamily, setAbandonedFamily] = useState<'all' | Service>('all');
  const [abandonedDuration, setAbandonedDuration] = useState<DurationFilter>('all');
  const [callbackFamilies, setCallbackFamilies] = useState<Service[]>(['premium']);
  const [minAbandon, setMinAbandon] = useState(5);
  const [minCallback, setMinCallback] = useState(10);

  const allCalls = useMemo(() => buildCalls(rows), [rows]);
  const anchor = useMemo(() => allCalls.map((c) => c.date).filter(Boolean).sort((a, b) => (b!.getTime() - a!.getTime()))[0] || null, [allCalls]);
  const defaultDay = anchor ? dayKey(anchor) : '';
  const effectiveStart = customStart || defaultDay;
  const effectiveEnd = customEnd || defaultDay;
  const periodCalls = useMemo(() => allCalls.filter((c) => periodFilter(c.date, periodMode, anchor, effectiveStart, effectiveEnd)), [allCalls, periodMode, anchor, effectiveStart, effectiveEnd]);
  const periodRows = useMemo(() => rows.filter((r) => periodFilter(r.time, periodMode, anchor, effectiveStart, effectiveEnd)), [rows, periodMode, anchor, effectiveStart, effectiveEnd]);
  const clients = useMemo(() => [...new Set(periodCalls.map((q) => q.client))].filter(isClientName).sort(), [periodCalls]);
  const operators = useMemo(() => [...new Set(periodCalls.flatMap((q) => q.rows.map((r) => r.operator).concat(q.operator)))].filter((o) => o && o !== 'Non identifie').sort(), [periodCalls]);
  const filteredCalls = useMemo(() => periodCalls.filter((q) => (client === 'all' || q.client === client) && (selectedOperators.includes('all') || selectedOperators.includes(q.operator) || q.rows.some((r) => selectedOperators.includes(r.operator)))), [periodCalls, client, selectedOperators]);
  const filteredRows = useMemo(() => periodRows.filter((r) => (client === 'all' || r.client === client) && (selectedOperators.includes('all') || selectedOperators.includes(r.operator))), [periodRows, client, selectedOperators]);
  const callbackSettings = useMemo(() => ({ families: callbackFamilies, minAbandon, minCallback }), [callbackFamilies, minAbandon, minCallback]);
  const stats = useMemo(() => summarize(filteredCalls, filteredRows, callbackSettings), [filteredCalls, filteredRows, callbackSettings]);
  const chartData = useMemo(() => [...groupBy(filteredCalls, (q) => (periodMode === 'day' || periodMode === 'custom' ? q.day : q.month)).entries()].sort().map(([label, list]) => ({ month: periodLabel(label), total: list.length, traites: list.filter((q) => q.treated).length, abandonnes: list.filter((q) => q.abandoned).length })), [filteredCalls, periodMode]);
  const byClient = useMemo(() => [...groupBy(filteredCalls.filter((q) => isClientName(q.client)), (q) => q.client).entries()].map(([label, list]) => ({ label, total: list.length, treated: list.filter((q) => q.treated).length, abandoned: list.filter((q) => q.abandoned).length, wait: fmtClock(list.reduce((s, q) => s + q.wait, 0)), talk: fmtClock(list.reduce((s, q) => s + q.talk, 0)), details: callDetails(list) })).sort((a, b) => b.total - a.total), [filteredCalls]);
  const byOperator = useMemo(() => {
    const takenByOperator = new Map<string, CallPath[]>();
    const probesByOperator = new Map<string, Set<string>>();
    for (const call of filteredCalls) {
      if (call.treated && call.operator && call.operator !== 'Non identifie') takenByOperator.set(call.operator, [...(takenByOperator.get(call.operator) || []), call]);
      for (const row of call.rows) { if (!isOperatorProbe(row)) continue; const key = `${call.callId}:${row.operator}`; const set = probesByOperator.get(row.operator) || new Set<string>(); set.add(key); probesByOperator.set(row.operator, set); }
    }
    const names = [...new Set([...takenByOperator.keys(), ...probesByOperator.keys()])].sort();
    return names.map((label) => { const list = takenByOperator.get(label) || []; const sondes = probesByOperator.get(label)?.size || 0; const prises = list.length; return { label, total: list.length, sondePrise: `${sondes} / ${prises}`, wait: fmtClock(list.reduce((s, q) => s + q.wait, 0)), talk: fmtClock(list.reduce((s, q) => s + q.talk, 0)), avg: list.length ? fmtClock(list.reduce((s, q) => s + q.talk, 0) / list.length) : '00:00:00', details: callDetails(list) }; }).sort((a, b) => b.total - a.total);
  }, [filteredCalls]);
  const abandonedVisible = useMemo(() => stats.abandoned.filter((q) => (abandonedFamily === 'all' || q.service === abandonedFamily) && isDurationMatch(q.wait, abandonedDuration)), [stats.abandoned, abandonedFamily, abandonedDuration]);
  const abandonedRows = useMemo((): AbandonedReportRow[] => abandonedVisible.map((q) => {
    const op = stats.operatorCallbacks.get(q.callId);
    const user = stats.userCallbacks.get(q.callId);
    return { date: frDateHour(q.date), label: q.client, phone: q.phone, service: q.service, wait: fmtClock(q.wait), waitSec: q.wait, status: statusForAbandon(q, op, user), operatorCallback: op ? `${op.operator} · rappel à ${frTime(op.time)} · durée ${fmt(op.duration)}` : 'Aucun rappel operatrice trouve', userCallback: user ? `Utilisateur a deja rappele · ${frTime(user.time)} · entrant decroche · pris par ${user.operator} · durée ${fmt(user.duration)}` : 'Aucun rappel entrant ulterieur detecte', details: callDetails([q]) };
  }), [abandonedVisible, stats.operatorCallbacks, stats.userCallbacks]);
  const abandonedCounts = useMemo(() => ({ total: abandonedVisible.length, premium: abandonedVisible.filter((q) => q.service === 'premium').length, forfait: abandonedVisible.filter((q) => q.service === 'forfait').length, autre: abandonedVisible.filter((q) => q.service === 'autre').length, plus5: abandonedVisible.filter((q) => q.wait > 5).length, plus10: abandonedVisible.filter((q) => q.wait > 10).length, plus30: abandonedVisible.filter((q) => q.wait > 30).length, plus60: abandonedVisible.filter((q) => q.wait > 60).length }), [abandonedVisible]);

  async function handleFile(file: File) { setRows(mapRows(parseCsv(await file.text()))); setPeriodMode('custom'); setCustomStart(''); setCustomEnd(''); }
  function toggleOperator(op: string) { if (op === 'all') { setSelectedOperators(['all']); return; } const base = selectedOperators.filter((x) => x !== 'all'); const next = base.includes(op) ? base.filter((x) => x !== op) : [...base, op]; setSelectedOperators(next.length ? next : ['all']); }
  function toggleCallbackFamily(service: Service) { setCallbackFamilies((current) => current.includes(service) ? current.filter((x) => x !== service) : [...current, service]); }
  function addUser() { if (!newEmail.trim()) return; setUsers([...users, { id: Date.now(), email: newEmail.trim(), name: 'Nouvel utilisateur', role: 'user', status: 'active', dashboard: true, monthly: false, clients: false, operators: false, abandoned: false, settings: false }]); setNewEmail(''); }

  return (
    <main className="appShell">
      <aside className="sidebar"><div className="brand">Nexus <span>V2</span></div><div className="userBox"><Shield size={18} />{loggedUser.email}<small>{loggedUser.role}</small></div><nav>{views.map((v) => <button key={v.key} className={activeView === v.key ? 'activeNav' : ''} onClick={() => setActiveView(v.key)}>{v.label}</button>)}</nav></aside>
      <section className="content">
        <header className="topbar"><div><h1>{views.find((v) => v.key === activeView)?.label}</h1><p>Periode active : {periodMode}. Date de reference : {frDate(anchor)}.</p></div><label className="uploadButton"><Upload size={18} /> Importer export 3CX<input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} /></label></header>
        <section className="filters"><label>Periode<select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}><option value="custom">Personnalise</option><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="quarter">Trimestre</option><option value="year">Annee</option></select></label>{periodMode === 'custom' && <><label>Debut<input type="date" value={effectiveStart} onChange={(e) => setCustomStart(e.target.value)} /></label><label>Fin<input type="date" value={effectiveEnd} onChange={(e) => setCustomEnd(e.target.value)} /></label></>}<label>Client<select value={client} onChange={(e) => setClient(e.target.value)}><option value="all">Tous</option>{clients.map((c) => <option key={c}>{c}</option>)}</select></label><div className="operatorFilter"><span>Operatrice</span><div className="operatorBox"><label><input type="checkbox" checked={selectedOperators.includes('all')} onChange={() => toggleOperator('all')} /> Toutes</label>{operators.map((o) => <label key={o}><input type="checkbox" checked={!selectedOperators.includes('all') && selectedOperators.includes(o)} onChange={() => toggleOperator(o)} /> {o}</label>)}</div></div><div className="periodHint"><CalendarDays size={16} /> Un clic coche ou decoche une operatrice.</div></section>
        {activeView === 'dashboard' && <Dashboard stats={stats} rows={rows} calls={filteredCalls} chartData={chartData} setDetail={setDetail} setActiveView={setActiveView} />}
        {activeView === 'monthly' && <Monthly data={chartData} />}
        {activeView === 'clients' && <Panel title="Analyse clients"><Table rows={byClient} columns={[["label", "Client"], ["total", "Total"], ["treated", "Traites"], ["abandoned", "Abandonnes"], ["wait", "Attente"], ["talk", "Parole"]]} onOpen={(r) => setDetail(r.details)} /></Panel>}
        {activeView === 'operators' && <Panel title="Analyse operatrices"><Table rows={byOperator} columns={[["label", "Operatrice"], ["total", "Appels"], ["sondePrise", "Qté sondé / prise"], ["wait", "Attente"], ["talk", "Parole"], ["avg", "Moyenne"]]} onOpen={(r) => setDetail(r.details)} /></Panel>}
        {activeView === 'abandoned' && <AbandonedView rows={abandonedRows} counts={abandonedCounts} family={abandonedFamily} setFamily={setAbandonedFamily} duration={abandonedDuration} setDuration={setAbandonedDuration} callbackFamilies={callbackFamilies} toggleFamily={toggleCallbackFamily} minAbandon={minAbandon} setMinAbandon={setMinAbandon} minCallback={minCallback} setMinCallback={setMinCallback} onOpen={(r: AbandonedReportRow) => setDetail(r.details)} />}
        {activeView === 'settings' && <Settings users={users} setUsers={setUsers} newEmail={newEmail} setNewEmail={setNewEmail} addUser={addUser} />}
        {!rows.length && <section className="emptyState"><PhoneCall size={32} /><h2>Importer un export 3CX pour demarrer</h2><p>La V2 analyse le fichier immediatement.</p></section>}
      </section>
      {detail && <Detail rows={detail} onClose={() => setDetail(null)} />}
    </main>
  );
}

function Dashboard({ stats, rows, chartData, setDetail, setActiveView }: { stats: DashboardStats; rows: Row[]; calls: CallPath[]; chartData: any[]; setDetail: (rows: DetailItem[]) => void; setActiveView: (view: ViewKey) => void }) { return <><section className="cards"><Stat title="Dates CSV" value={uniqueDays(rows)} subtitle={dateRangeLabel(rows)} /><Stat title="Appels traites" value={`${stats.treated.length} / ${stats.total}`} subtitle={`${stats.answerRate}% des entrants`} onClick={() => setDetail(callDetails(stats.treated))} /><Stat title="Abandonnes" value={stats.abandoned.length} subtitle={`Dont ${stats.abandonedOver5} appel(s) de plus de 5 secondes · Premium ${stats.premiumOver5} · Forfait ${stats.forfaitOver5}`} tone="danger" onClick={() => setActiveView('abandoned')} /><Stat title="Total entrants" value={stats.total} subtitle="traites + abandonnes" onClick={() => setDetail(callDetails(stats.calls))} /><Stat title="Total a facturer" value={stats.invoiceTotal} subtitle="clients + rappels + sortants" /><Stat title="Sortants clients" value={stats.outbound} subtitle="repondus >= 10 sec" onClick={() => setDetail(outboundDetails(stats.outboundRows))} /><Stat title="Rappels realises" value={stats.callbacksDone} subtitle={`${stats.callbacksDone} rappel(s) operatrice`} onClick={() => setActiveView('abandoned')} /><Stat title="Rappels restants" value={stats.callbacksRemaining} subtitle="selon parametrage actif" onClick={() => setActiveView('abandoned')} /><Stat title="Inter-collab." value={stats.internal} subtitle="appels internes" /><Stat title="Attente max" value={fmt(stats.maxWait)} subtitle="abandonnes" /><Stat title="Attente moy." value={fmt(stats.avgAbandonedWait)} subtitle="abandonnes" /><Stat title="Parole moy." value={fmt(stats.avgTalk)} subtitle={`${stats.treated.length} conversations`} /></section><Panel title="Courbe par periode"><ResponsiveContainer width="100%" height={320}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Line type="linear" dataKey="total" name="Total entrants" dot={false} /><Line type="linear" dataKey="traites" name="Traites" dot={false} /><Line type="linear" dataKey="abandonnes" name="Abandonnes" dot={false} /></LineChart></ResponsiveContainer></Panel></>; }
function Monthly({ data }: { data: any[] }) { return <Panel title="Stats mensuelles"><ResponsiveContainer width="100%" height={360}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="total" name="Total entrants" /><Bar dataKey="traites" name="Traites" /><Bar dataKey="abandonnes" name="Abandonnes" /></BarChart></ResponsiveContainer></Panel>; }
function AbandonedView({ rows, counts, family, setFamily, duration, setDuration, callbackFamilies, toggleFamily, minAbandon, setMinAbandon, minCallback, setMinCallback, onOpen }: { rows: AbandonedReportRow[]; counts: any; family: 'all' | Service; setFamily: (v: 'all' | Service) => void; duration: DurationFilter; setDuration: (v: DurationFilter) => void; callbackFamilies: Service[]; toggleFamily: (v: Service) => void; minAbandon: number; setMinAbandon: (v: number) => void; minCallback: number; setMinCallback: (v: number) => void; onOpen: (row: AbandonedReportRow) => void }) { return <Panel title="Appels abandonnes"><section className="filters"><label>Famille<select value={family} onChange={(e) => setFamily(e.target.value as 'all' | Service)}><option value="all">Toutes</option><option value="premium">Premium</option><option value="forfait">Forfait</option><option value="autre">Autres</option></select></label><label>Duree<select value={duration} onChange={(e) => setDuration(e.target.value as DurationFilter)}><option value="all">Toutes</option><option value="gt5">Plus de 5 secondes</option><option value="gt10">Plus de 10 secondes</option><option value="gt30">Plus de 30 secondes</option><option value="gt60">Plus de 60 secondes</option></select></label><div className="periodHint">Total {counts.total} · Premium {counts.premium} · Forfait {counts.forfait} · Autres {counts.autre} · &gt;5s {counts.plus5} · &gt;10s {counts.plus10} · &gt;30s {counts.plus30} · &gt;60s {counts.plus60}</div></section><section className="panel"><h2>Parametrage rappels restants</h2><div className="settingsActions">{services.map((s) => <label key={s}><input type="checkbox" checked={callbackFamilies.includes(s)} onChange={() => toggleFamily(s)} /> {s}</label>)}<label>Abandon &gt; <input type="number" value={minAbandon} onChange={(e) => setMinAbandon(Number(e.target.value))} /> sec</label><label>Rappel sortant &gt;= <input type="number" value={minCallback} onChange={(e) => setMinCallback(Number(e.target.value))} /> sec</label><button onClick={() => exportPdf(rows)}>Export PDF</button><button onClick={() => exportCsv(rows)}>Export Excel</button></div></section><Table rows={rows} columns={[["status", "Statut"], ["date", "Date / heure appel"], ["label", "Client"], ["phone", "Telephone"], ["service", "Famille"], ["wait", "Attente"], ["operatorCallback", "Rappel operatrice"], ["userCallback", "Utilisateur a deja rappele"]]} onOpen={onOpen} /></Panel>; }
function Settings({ users, setUsers, newEmail, setNewEmail, addUser }: { users: UserRow[]; setUsers: (u: UserRow[]) => void; newEmail: string; setNewEmail: (v: string) => void; addUser: () => void }) { function update(id: number, key: keyof UserRow, value: any) { setUsers(users.map((u) => u.id === id ? { ...u, [key]: value } : u)); } return <Panel title="Parametres utilisateurs"><div className="settingsActions"><input placeholder="email utilisateur" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /><button onClick={addUser}>Creer utilisateur</button></div><Table rows={users.map((u) => ({ ...u, actions: 'Supprimer' }))} columns={[["email", "Email"], ["name", "Nom"], ["role", "Role"], ["status", "Statut"]]} onOpen={(r) => setUsers(users.filter((u) => u.id !== r.id))} /><div className="tableWrap"><table><thead><tr><th>Utilisateur</th>{views.map((v) => <th key={v.key}>{v.label}</th>)}</tr></thead><tbody>{users.map((u) => <tr key={u.id}><td>{u.email}</td>{views.map((v) => <td key={v.key}><input type="checkbox" checked={Boolean((u as any)[v.key])} onChange={(e) => update(u.id, v.key as keyof UserRow, e.target.checked)} /></td>)}</tr>)}</tbody></table></div></Panel>; }
function Stat({ title, value, subtitle, tone, onClick }: { title: string; value: number | string; subtitle?: string; tone?: 'danger' | 'warning'; onClick?: () => void }) { return <button className={`statCard ${tone || ''}`} onClick={onClick || (() => {})}><span>{title}</span><b>{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</b>{subtitle && <small>{subtitle}</small>}</button>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
function Table({ rows, columns, onOpen }: { rows: any[]; columns: [string, string][]; onOpen: (row: any) => void }) { return <div className="tableWrap"><table><thead><tr>{columns.map(([, l]) => <th key={l}>{l}</th>)}<th>Detail</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{columns.map(([k]) => <td key={k}>{r[k]}</td>)}<td><button className="small" onClick={() => onOpen(r)}>{r.actions || 'Ouvrir'}</button></td></tr>)}</tbody></table></div>; }
function Detail({ rows, onClose }: { rows: DetailItem[]; onClose: () => void }) { return <div className="modalBackdrop"><div className="modal"><header><h2>Detail du parcours appel</h2><button onClick={onClose}>Fermer</button></header><div className="tableWrap"><table><thead><tr><th>Date</th><th>Client</th><th>Operatrice</th><th>Telephone</th><th>Etape</th><th>Statut</th><th>Attente</th><th>Parole</th></tr></thead><tbody>{rows.slice(0, 500).map((r) => <tr key={r.id}><td>{r.date}</td><td>{r.client}</td><td>{r.operator}</td><td>{r.phone}</td><td>{r.step}</td><td>{r.status}</td><td>{fmtClock(r.wait)}</td><td>{fmtClock(r.talk)}</td></tr>)}</tbody></table></div></div></div>; }

createRoot(document.getElementById('root')!).render(<App />);
