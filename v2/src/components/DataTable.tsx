import { useMemo, useState } from 'react';
import { NexModal } from './NexModal';

type Column = [string, string];

type DataTableProps = {
  rows: any[];
  columns: Column[];
  onOpen: (row: any) => void;
};

type NexCell = {
  column: string;
  value: unknown;
  row: Record<string, unknown>;
} | null;

const excludedColumns = [
  'date', 'heure', 'client', 'telephone', 'téléphone', 'statut', 'famille', 'operatrice', 'opératrice', 'detail', 'détail', 'explication', 'rappel operatrice', 'rappel opératrice', 'utilisateur', 'sonde / prise', 'sondé / prise', 'appels manques / rappels jour', 'appels manqués / rappels jour',
];

function normalize(value: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function parseComparableNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text || text.includes('/') && !text.endsWith('/10')) return null;
  const scoreMatch = text.match(/^(-?\d+(?:[.,]\d+)?)\s*\/\s*10$/);
  if (scoreMatch) return Number(scoreMatch[1].replace(',', '.'));
  const percentMatch = text.match(/^(-?\d+(?:[.,]\d+)?)\s*%$/);
  if (percentMatch) return Number(percentMatch[1].replace(',', '.'));
  const timeMatch = text.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (timeMatch) return Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
  const numeric = text.replace(/\s/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(numeric)) return Number(numeric);
  return null;
}

function isColorableColumn(label: string) {
  const normalized = normalize(label);
  return !excludedColumns.some((excluded) => normalized.includes(normalize(excluded)));
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], avg: number) {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function buildColumnStats(rows: any[], columns: Column[]) {
  const stats = new Map<string, { avg: number; sd: number }>();
  for (const [key, label] of columns) {
    if (!isColorableColumn(label)) continue;
    const values = rows.map((row) => parseComparableNumber(row[key])).filter((value): value is number => value !== null);
    if (values.length < 2) continue;
    const avg = average(values);
    if (avg === null) continue;
    stats.set(key, { avg, sd: standardDeviation(values, avg) });
  }
  return stats;
}

function valueTone(value: unknown, stat?: { avg: number; sd: number }) {
  if (!stat) return '';
  const numberValue = parseComparableNumber(value);
  if (numberValue === null) return '';
  const tolerance = Math.max(Math.abs(stat.avg) * 0.05, stat.sd * 0.25, 0.01);
  const lowLimit = stat.avg - Math.max(Math.abs(stat.avg) * 0.15, stat.sd * 0.75, 0.01);
  if (numberValue >= stat.avg + tolerance) return 'valueGood';
  if (numberValue <= lowLimit) return 'valueBad';
  return 'valueNeutral';
}

function lowerValueTone(value: unknown, stat?: { avg: number; sd: number }) {
  if (!stat) return '';
  const numberValue = parseComparableNumber(value);
  if (numberValue === null) return '';
  const tolerance = Math.max(Math.abs(stat.avg) * 0.05, stat.sd * 0.25, 0.01);
  const highLimit = stat.avg + Math.max(Math.abs(stat.avg) * 0.15, stat.sd * 0.75, 0.01);
  if (numberValue <= stat.avg - tolerance) return 'valueGood';
  if (numberValue >= highLimit) return 'valueBad';
  return 'valueNeutral';
}

function isLowerBetterColumn(label: string) {
  const normalizedLabel = normalize(label);
  return normalizedLabel.includes('parole') || normalizedLabel.includes('talk') || normalizedLabel.includes('attente') || normalizedLabel.includes('wait');
}

function isHandledAbandon(row: any) {
  const operatorCallback = normalize(String(row.operatorCallback || ''));
  const userCallback = normalize(String(row.userCallback || ''));
  return !operatorCallback.includes('aucun rappel operatrice trouve') || !userCallback.includes('aucun rappel entrant ulterieur detecte');
}

function abandonedWaitTone(row: any) {
  const seconds = Number(row.waitSec || parseComparableNumber(row.wait) || 0);
  if (seconds >= 60) return 'valueCritical';
  if (seconds >= 30) return 'valueBad';
  if (seconds >= 15) return 'valueNeutral';
  return 'valueGood';
}

function missedRecalledTone(row: any) { return row.allMissedRecalled ? 'valueGood' : 'valueBad'; }
function missedDayTone(row: any) { if (isHandledAbandon(row)) return 'valueGood'; const count = Number(row.missedDay || 0); if (count >= 3) return 'valueBad'; if (count === 2) return 'valueNeutral'; return 'valueGood'; }

function treatedTone(row: any) {
  const total = Number(row.total || 0);
  const treated = Number(row.treated || 0);
  if (!total) return '';
  const rate = (treated / total) * 100;
  if (rate >= 90) return 'valueGood';
  if (rate >= 60) return 'valueNeutral';
  return 'valueBad';
}

function abandonedTone(row: any) {
  const total = Number(row.total || 0);
  const abandoned = Number(row.abandoned || 0);
  if (!total) return '';
  const rate = (abandoned / total) * 100;
  if (rate <= 10) return 'valueGood';
  if (rate <= 40) return 'valueNeutral';
  return 'valueBad';
}

function customTone(key: string, label: string, row: any) {
  const normalizedLabel = normalize(label);
  if (key === 'wait' && normalizedLabel.includes('attente') && 'waitSec' in row) return abandonedWaitTone(row);
  if (key === 'missedRecalledDay') return missedRecalledTone(row);
  if (key === 'missedDay') return missedDayTone(row);
  if (key === 'treated' && 'total' in row) return treatedTone(row);
  if (key === 'abandoned' && 'total' in row) return abandonedTone(row);
  return '';
}

function cellDetailsKey(key: string) {
  return `${key}Details`;
}

export function DataTable({ rows, columns, onOpen }: DataTableProps) {
  const [nexCell, setNexCell] = useState<NexCell>(null);
  const columnStats = useMemo(() => buildColumnStats(rows, columns), [rows, columns]);

  function handleCellClick(row: any, key: string, label: string) {
    const details = row[cellDetailsKey(key)];
    if (Array.isArray(details)) {
      onOpen({ ...row, details });
      return;
    }
    setNexCell({ column: label, value: row[key], row });
  }

  return (
    <>
      <div className="tableWrap">
        <table>
          <thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Détail</th></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map(([key, label]) => {
                  const stat = columnStats.get(key);
                  const tone = customTone(key, label, row) || (isLowerBetterColumn(label) ? lowerValueTone(row[key], stat) : valueTone(row[key], stat));
                  const hasDetails = Array.isArray(row[cellDetailsKey(key)]);
                  return <td key={key} className={`clickableCell ${hasDetails ? 'cellHasDetails' : ''} ${tone}`.trim()} onClick={() => handleCellClick(row, key, label)} title={hasDetails ? 'Cliquer pour voir les appels concernés' : 'Cliquer pour l’explication NEX'}>{row[key]}</td>;
                })}
                <td><button className="small" onClick={() => onOpen(row)}>{row.actions || 'Ouvrir'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nexCell && <NexModal title="Explication de la cellule" column={nexCell.column} value={nexCell.value} row={nexCell.row} onClose={() => setNexCell(null)} />}
    </>
  );
}
