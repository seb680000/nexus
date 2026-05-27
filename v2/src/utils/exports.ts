import type { AbandonedReportRow } from '../types';
import { buildCsv } from './csv';

type ExportRow = AbandonedReportRow & {
  missedRecalledDay?: string;
  assignedCallbackOperator?: string;
};

export function exportAbandonedCsv(rows: ExportRow[]) {
  const headers = [
    'Date heure appel',
    'Statut',
    'Client',
    'Appels manques / rappels jour',
    'Operatrice chargee du rappel',
    'Telephone',
    'Famille',
    'Duree attente',
    'Rappel operatrice',
    'Utilisateur a deja rappele',
  ];

  const body = rows.map((row) => [
    row.date,
    row.status,
    row.label,
    row.missedRecalledDay || '',
    row.assignedCallbackOperator || '',
    row.phone,
    row.service,
    row.wait,
    row.operatorCallback,
    row.userCallback,
  ]);

  const csv = buildCsv(headers, body);
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `appels_abandonnes_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportAbandonedPdf(rows: ExportRow[]) {
  const htmlRows = rows
    .map(
      (row) =>
        `<tr><td>${row.status}</td><td>${row.date}</td><td>${row.label}<br/>${row.phone}</td><td>${row.missedRecalledDay || ''}</td><td>${row.assignedCallbackOperator || ''}</td><td>${row.wait}</td><td>${row.service}</td><td>${row.operatorCallback}</td><td>${row.userCallback}</td></tr>`
    )
    .join('');

  const popup = window.open('', '_blank');
  if (!popup) return;

  popup.document.write(`
    <html>
      <head>
        <title>Appels abandonnes rappels</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 7px; text-align: left; vertical-align: top; }
          th { background: #f1f5f9; }
        </style>
      </head>
      <body>
        <h1>Appels abandonnes / rappels sortants</h1>
        <p>Export genere depuis Nexus V2</p>
        <table>
          <thead>
            <tr>
              <th>Statut</th>
              <th>Date / heure appel</th>
              <th>Appelant / client</th>
              <th>Manques / rappels jour</th>
              <th>Operatrice chargee du rappel</th>
              <th>Duree attente</th>
              <th>Type</th>
              <th>Rappel operatrice</th>
              <th>Utilisateur a deja rappele</th>
            </tr>
          </thead>
          <tbody>${htmlRows}</tbody>
        </table>
      </body>
    </html>
  `);

  popup.document.close();
  popup.print();
}
