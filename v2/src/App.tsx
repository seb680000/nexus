import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PhoneCall, Shield } from 'lucide-react';
import './styles.css';

import type { AbandonedReportRow, CallPath, ChartMetric, DetailItem, DurationFilter, PeriodMode, Row, Service, UserRow, ViewKey } from './types';
import { AbandonedView } from './components/AbandonedView';
import { DashboardView } from './components/DashboardView';
import { DataTable } from './components/DataTable';
import { DetailModal } from './components/DetailModal';
import { GlobalFilters } from './components/GlobalFilters';
import { Header } from './components/Header';
import { MonthlyView } from './components/MonthlyView';
import { Panel } from './components/Panel';
import { SettingsView } from './components/SettingsView';
import { addDays, dayKey, frDateHour, frTime, parseDate, startOfWeek } from './utils/dates';
import { formatClock, formatDuration } from './utils/format';
import { parseCsv } from './utils/csv';
import {
  buildCalls,
  buildOperatorAnalysis,
  callDetails,
  groupBy,
  isClientName,
  isDurationMatch,
  isOperatorProbe,
  mapRows,
  statusForAbandon,
  summarize,
} from './utils/calls';

const loggedUser = { email: 'sebastien.schmitt57@gmail.com', role: 'superadmin' };

const views: { key: ViewKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'monthly', label: 'Stats mensuelles' },
  { key: 'clients', label: 'Clients' },
  { key: 'operators', label: 'Operatrices' },
  { key: 'abandoned', label: 'Abandonnes' },
  { key: 'settings', label: 'Parametres' },
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function frShortDate(date: Date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(2)}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }).replace('.', '');
}

function callHasSelectedOperator(call: CallPath, selectedOperators: string[]) {
  if (selectedOperators.includes('all')) return true;

  return (
    selectedOperators.includes(call.operator) ||
    call.rows.some((row) => selectedOperators.includes(row.operator)) ||
    call.rows.some((row) => isOperatorProbe(row) && selectedOperators.includes(row.operator))
  );
}

function rowHasSelectedOperator(row: Row, selectedOperators: string[]) {
  if (selectedOperators.includes('all')) return true;
  return selectedOperators.includes(row.operator) || (isOperatorProbe(row) && selectedOperators.includes(row.operator));
}

function periodFilter(date: Date | null, mode: PeriodMode, anchor: Date | null, customStart: string, customEnd: string) {
  if (!date || !anchor) return false;

  if (mode === 'custom') {
    const start = customStart ? new Date(customStart) : new Date(anchor);
    const end = customEnd ? new Date(customEnd) : new Date(anchor);
    start.setHours(0, 1, 0, 0);
    end.setHours(23, 0, 0, 0);
    return date >= start && date <= end;
  }

  if (mode === 'day') return dayKey(date) === dayKey(anchor);

  if (mode === 'week') {
    const start = startOfWeek(anchor);
    const end = addDays(start, 7);
    return date >= start && date < end;
  }

  if (mode === 'month') {
    return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
  }

  if (mode === 'quarter') {
    return date.getFullYear() === anchor.getFullYear() && Math.floor(date.getMonth() / 3) === Math.floor(anchor.getMonth() / 3);
  }

  return date.getFullYear() === anchor.getFullYear();
}

function metricValue(calls: CallPath[], rows: Row[], metric: ChartMetric, callbackSettings: { families: Service[]; minAbandon: number; minCallback: number; minUserCallback: number }) {
  const summary = summarize(calls, rows, callbackSettings);

  if (metric === 'invoiceTotal') return summary.invoiceTotal;
  if (metric === 'treated') return summary.treated.length;
  if (metric === 'abandoned') return summary.abandoned.length;
  if (metric === 'total') return summary.total;
  if (metric === 'outbound') return summary.outbound;
  if (metric === 'callbacksDone') return summary.callbacksDone;
  if (metric === 'callbacksRemaining') return summary.callbacksRemaining;
  if (metric === 'internal') return summary.internal;
  if (metric === 'maxWait') return summary.maxWait;
  if (metric === 'avgAbandonedWait') return Math.round(summary.avgAbandonedWait);
  if (metric === 'avgTalk') return Math.round(summary.avgTalk);

  return summary.invoiceTotal;
}

function buildMetricBucket(label: string, calls: CallPath[], rows: Row[], metric: ChartMetric, callbackSettings: { families: Service[]; minAbandon: number; minCallback: number; minUserCallback: number }) {
  return {
    month: label,
    value: metricValue(calls, rows, metric, callbackSettings),
  };
}

function buildChartData(calls: CallPath[], rows: Row[], mode: PeriodMode, anchor: Date | null, metric: ChartMetric, callbackSettings: { families: Service[]; minAbandon: number; minCallback: number; minUserCallback: number }) {
  if (!anchor) return [];

  if (mode === 'day' || mode === 'custom') {
    const datedCalls = calls.filter((call) => call.date).sort((a, b) => a.date!.getTime() - b.date!.getTime());
    const datedRows = rows.filter((row) => row.time).sort((a, b) => a.time!.getTime() - b.time!.getTime());
    const firstTime = datedCalls[0]?.date || datedRows[0]?.time;
    const lastTime = datedCalls[datedCalls.length - 1]?.date || datedRows[datedRows.length - 1]?.time;

    if (!firstTime || !lastTime) return [];

    const firstHour = firstTime.getHours();
    const lastHour = lastTime.getHours();
    const callsByHour = groupBy(datedCalls, (call) => `${pad(call.date!.getHours())}h`);
    const rowsByHour = groupBy(datedRows, (row) => `${pad(row.time!.getHours())}h`);

    return Array.from({ length: lastHour - firstHour + 1 }, (_, index) => {
      const label = `${pad(firstHour + index)}h`;
      return buildMetricBucket(label, callsByHour.get(label) || [], rowsByHour.get(label) || [], metric, callbackSettings);
    });
  }

  if (mode === 'week') {
    const start = startOfWeek(anchor);
    const callsByDay = groupBy(calls, (call) => (call.date ? frShortDate(call.date) : 'inconnu'));
    const rowsByDay = groupBy(rows, (row) => (row.time ? frShortDate(row.time) : 'inconnu'));

    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      const label = frShortDate(date);
      return buildMetricBucket(label, callsByDay.get(label) || [], rowsByDay.get(label) || [], metric, callbackSettings);
    });
  }

  if (mode === 'month') {
    const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    const callsByDay = groupBy(calls, (call) => (call.date ? frShortDate(call.date) : 'inconnu'));
    const rowsByDay = groupBy(rows, (row) => (row.time ? frShortDate(row.time) : 'inconnu'));

    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(firstDay);
      date.setDate(index + 1);
      const label = frShortDate(date);
      return buildMetricBucket(label, callsByDay.get(label) || [], rowsByDay.get(label) || [], metric, callbackSettings);
    });
  }

  if (mode === 'quarter') {
    const quarterStartMonth = Math.floor(anchor.getMonth() / 3) * 3;
    const callsByMonth = groupBy(calls, (call) => (call.date ? monthLabel(call.date) : 'inconnu'));
    const rowsByMonth = groupBy(rows, (row) => (row.time ? monthLabel(row.time) : 'inconnu'));

    return Array.from({ length: 3 }, (_, index) => {
      const date = new Date(anchor.getFullYear(), quarterStartMonth + index, 1);
      const label = monthLabel(date);
      return buildMetricBucket(label, callsByMonth.get(label) || [], rowsByMonth.get(label) || [], metric, callbackSettings);
    });
  }

  const callsByMonth = groupBy(calls, (call) => (call.date ? monthLabel(call.date) : 'inconnu'));
  const rowsByMonth = groupBy(rows, (row) => (row.time ? monthLabel(row.time) : 'inconnu'));

  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(anchor.getFullYear(), index, 1);
    const label = monthLabel(date);
    return buildMetricBucket(label, callsByMonth.get(label) || [], rowsByMonth.get(label) || [], metric, callbackSettings);
  });
}

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('custom');
  const [client, setClient] = useState('all');
  const [selectedOperators, setSelectedOperators] = useState<string[]>(['all']);
  const [detail, setDetail] = useState<DetailItem[] | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [settingsSection, setSettingsSection] = useState<ViewKey>('abandoned');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('invoiceTotal');

  const [users, setUsers] = useState<UserRow[]>([
    {
      id: 1,
      email: 'sebastien.schmitt57@gmail.com',
      name: 'Sebastien Schmitt',
      role: 'superadmin',
      status: 'active',
      dashboard: true,
      monthly: true,
      clients: true,
      operators: true,
      abandoned: true,
      settings: true,
    },
  ]);

  const [newEmail, setNewEmail] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [abandonedFamily, setAbandonedFamily] = useState<'all' | Service>('all');
  const [abandonedDuration, setAbandonedDuration] = useState<DurationFilter>('all');
  const [callbackFamilies, setCallbackFamilies] = useState<Service[]>(['premium']);
  const [minAbandon, setMinAbandon] = useState(5);
  const [minCallback, setMinCallback] = useState(20);
  const [minUserCallback, setMinUserCallback] = useState(10);

  const allCalls = useMemo(() => buildCalls(rows), [rows]);

  const anchor = useMemo(
    () => allCalls.map((call) => call.date).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] || null,
    [allCalls]
  );

  const defaultDay = anchor ? dayKey(anchor) : '';
  const effectiveStart = customStart || defaultDay;
  const effectiveEnd = customEnd || defaultDay;

  const periodCalls = useMemo(
    () => allCalls.filter((call) => periodFilter(call.date, periodMode, anchor, effectiveStart, effectiveEnd)),
    [allCalls, periodMode, anchor, effectiveStart, effectiveEnd]
  );

  const periodRows = useMemo(
    () => rows.filter((row) => periodFilter(row.time, periodMode, anchor, effectiveStart, effectiveEnd)),
    [rows, periodMode, anchor, effectiveStart, effectiveEnd]
  );

  const clients = useMemo(
    () => [...new Set(periodCalls.map((call) => call.client))].filter(isClientName).sort(),
    [periodCalls]
  );

  const operators = useMemo(
    () =>
      [...new Set(periodCalls.flatMap((call) => call.rows.map((row) => row.operator).concat(call.operator)))]
        .filter((operator) => operator && operator !== 'Non identifie')
        .sort(),
    [periodCalls]
  );

  const filteredCalls = useMemo(
    () =>
      periodCalls.filter(
        (call) =>
          (client === 'all' || call.client === client) && callHasSelectedOperator(call, selectedOperators)
      ),
    [periodCalls, client, selectedOperators]
  );

  const filteredRows = useMemo(
    () =>
      periodRows.filter(
        (row) =>
          (client === 'all' || row.client === client) && rowHasSelectedOperator(row, selectedOperators)
      ),
    [periodRows, client, selectedOperators]
  );

  const callbackSettings = useMemo(
    () => ({ families: callbackFamilies, minAbandon, minCallback, minUserCallback }),
    [callbackFamilies, minAbandon, minCallback, minUserCallback]
  );

  const stats = useMemo(() => summarize(filteredCalls, filteredRows, callbackSettings), [filteredCalls, filteredRows, callbackSettings]);
  const chartData = useMemo(() => buildChartData(filteredCalls, filteredRows, periodMode, anchor, chartMetric, callbackSettings), [filteredCalls, filteredRows, periodMode, anchor, chartMetric, callbackSettings]);

  const byClient = useMemo(
    () =>
      [...groupBy(filteredCalls.filter((call) => isClientName(call.client)), (call) => call.client).entries()]
        .map(([label, list]) => ({
          label,
          total: list.length,
          treated: list.filter((call) => call.treated).length,
          abandoned: list.filter((call) => call.abandoned).length,
          wait: formatClock(list.reduce((sum, call) => sum + call.wait, 0)),
          talk: formatClock(list.reduce((sum, call) => sum + call.talk, 0)),
          details: callDetails(list),
        }))
        .sort((a, b) => b.total - a.total),
    [filteredCalls]
  );

  const byOperator = useMemo(() => {
    const { takenByOperator, probesByOperator } = buildOperatorAnalysis(filteredCalls);
    const names = [...new Set([...takenByOperator.keys(), ...probesByOperator.keys()])].sort();

    return names
      .map((label) => {
        const list = takenByOperator.get(label) || [];
        const probes = probesByOperator.get(label)?.size || 0;

        return {
          label,
          total: list.length,
          sondePrise: `${probes} / ${list.length}`,
          wait: formatClock(list.reduce((sum, call) => sum + call.wait, 0)),
          talk: formatClock(list.reduce((sum, call) => sum + call.talk, 0)),
          avg: list.length ? formatClock(list.reduce((sum, call) => sum + call.talk, 0) / list.length) : '00:00:00',
          details: callDetails(list),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [filteredCalls]);

  const abandonedVisible = useMemo(
    () => stats.abandoned.filter((call) => (abandonedFamily === 'all' || call.service === abandonedFamily) && isDurationMatch(call.wait, abandonedDuration)),
    [stats.abandoned, abandonedFamily, abandonedDuration]
  );

  const abandonedRows = useMemo(
    (): AbandonedReportRow[] =>
      abandonedVisible.map((call) => {
        const operatorCallback = stats.operatorCallbacks.get(call.callId) || null;
        const userCallback = stats.userCallbacks.get(call.callId) || null;

        return {
          date: frDateHour(call.date),
          label: call.client,
          phone: call.phone,
          service: call.service,
          wait: formatClock(call.wait),
          waitSec: call.wait,
          status: statusForAbandon(call, operatorCallback, userCallback),
          operatorCallback: operatorCallback
            ? `${operatorCallback.operator} · rappel à ${frTime(operatorCallback.time)} · durée ${formatDuration(operatorCallback.duration)}`
            : 'Aucun rappel operatrice trouve',
          userCallback: userCallback
            ? `Utilisateur a deja rappele · ${frTime(userCallback.time)} · entrant decroche · pris par ${userCallback.operator} · durée ${formatDuration(userCallback.duration)}`
            : 'Aucun rappel entrant ulterieur detecte',
          details: callDetails([call]),
        };
      }),
    [abandonedVisible, stats.operatorCallbacks, stats.userCallbacks]
  );

  const abandonedCounts = useMemo(
    () => ({
      total: abandonedVisible.length,
      premium: abandonedVisible.filter((call) => call.service === 'premium').length,
      forfait: abandonedVisible.filter((call) => call.service === 'forfait').length,
      autre: abandonedVisible.filter((call) => call.service === 'autre').length,
      plus5: abandonedVisible.filter((call) => call.wait > 5).length,
      plus10: abandonedVisible.filter((call) => call.wait > 10).length,
      plus30: abandonedVisible.filter((call) => call.wait > 30).length,
      plus60: abandonedVisible.filter((call) => call.wait > 60).length,
    }),
    [abandonedVisible]
  );

  async function handleFile(file: File) {
    setRows(mapRows(parseCsv(await file.text()), parseDate));
    setPeriodMode('custom');
    setCustomStart('');
    setCustomEnd('');
  }

  function toggleOperator(operator: string) {
    if (operator === 'all') {
      setSelectedOperators(['all']);
      return;
    }

    const base = selectedOperators.filter((value) => value !== 'all');
    const next = base.includes(operator) ? base.filter((value) => value !== operator) : [...base, operator];
    setSelectedOperators(next.length ? next : ['all']);
  }

  function toggleCallbackFamily(service: Service) {
    setCallbackFamilies((current) => (current.includes(service) ? current.filter((value) => value !== service) : [...current, service]));
  }

  function addUser() {
    if (!newEmail.trim()) return;

    setUsers([
      ...users,
      {
        id: Date.now(),
        email: newEmail.trim(),
        name: 'Nouvel utilisateur',
        role: 'user',
        status: 'active',
        dashboard: true,
        monthly: false,
        clients: false,
        operators: false,
        abandoned: false,
        settings: false,
      },
    ]);
    setNewEmail('');
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">Nexus <span>V2</span></div>
        <div className="userBox"><Shield size={18} />{loggedUser.email}<small>{loggedUser.role}</small></div>
        <nav>
          {views.map((view) => (
            <button key={view.key} className={activeView === view.key ? 'activeNav' : ''} onClick={() => setActiveView(view.key)}>
              {view.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="content">
        <Header activeView={activeView} anchor={anchor} onFile={handleFile} />
        <GlobalFilters
          periodMode={periodMode}
          setPeriodMode={setPeriodMode}
          effectiveStart={effectiveStart}
          setCustomStart={setCustomStart}
          effectiveEnd={effectiveEnd}
          setCustomEnd={setCustomEnd}
          client={client}
          setClient={setClient}
          clients={clients}
          selectedOperators={selectedOperators}
          toggleOperator={toggleOperator}
          operators={operators}
        />

        {activeView === 'dashboard' && <DashboardView stats={stats} rows={rows} chartData={chartData} chartMetric={chartMetric} setChartMetric={setChartMetric} setDetail={setDetail} setActiveView={setActiveView} />}
        {activeView === 'monthly' && <MonthlyView data={chartData} chartMetric={chartMetric} setChartMetric={setChartMetric} />}
        {activeView === 'clients' && (
          <Panel title="Analyse clients">
            <DataTable rows={byClient} columns={[["label", "Client"], ["total", "Total"], ["treated", "Traites"], ["abandoned", "Abandonnes"], ["wait", "Attente"], ["talk", "Parole"]]} onOpen={(row) => setDetail(row.details)} />
          </Panel>
        )}
        {activeView === 'operators' && (
          <Panel title="Analyse operatrices">
            <DataTable rows={byOperator} columns={[["label", "Operatrice"], ["total", "Appels"], ["sondePrise", "Qte sonde / prise"], ["wait", "Attente"], ["talk", "Parole"], ["avg", "Moyenne"]]} onOpen={(row) => setDetail(row.details)} />
          </Panel>
        )}
        {activeView === 'abandoned' && (
          <AbandonedView rows={abandonedRows} counts={abandonedCounts} family={abandonedFamily} setFamily={setAbandonedFamily} duration={abandonedDuration} setDuration={setAbandonedDuration} onOpen={(row) => setDetail(row.details)} />
        )}
        {activeView === 'settings' && (
          <SettingsView
            users={users}
            setUsers={setUsers}
            newEmail={newEmail}
            setNewEmail={setNewEmail}
            addUser={addUser}
            settingsSection={settingsSection}
            setSettingsSection={setSettingsSection}
            callbackFamilies={callbackFamilies}
            toggleFamily={toggleCallbackFamily}
            minAbandon={minAbandon}
            setMinAbandon={setMinAbandon}
            minCallback={minCallback}
            setMinCallback={setMinCallback}
            minUserCallback={minUserCallback}
            setMinUserCallback={setMinUserCallback}
          />
        )}

        {!rows.length && (
          <section className="emptyState">
            <PhoneCall size={32} />
            <h2>Importer un export 3CX pour demarrer</h2>
            <p>La V2 analyse le fichier immediatement.</p>
          </section>
        )}
      </section>

      {detail && <DetailModal rows={detail} onClose={() => setDetail(null)} />}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
