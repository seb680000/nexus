import { useState } from 'react';
import type { DetailItem } from '../types';
import { formatClock } from '../utils/format';
import { NexModal } from './NexModal';

type DetailModalProps = {
  rows: DetailItem[];
  onClose: () => void;
};

type NexCell = {
  column: string;
  value: unknown;
  row: Record<string, unknown>;
} | null;

export function DetailModal({ rows, onClose }: DetailModalProps) {
  const [nexCell, setNexCell] = useState<NexCell>(null);

  function openNex(column: string, value: unknown, row: DetailItem) {
    setNexCell({ column, value, row: row as unknown as Record<string, unknown> });
  }

  return (
    <div className="modalBackdrop">
      <div className="modal">
        <header>
          <h2>Détail du parcours appel</h2>
          <button onClick={onClose}>Fermer</button>
        </header>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Attribution</th>
                <th>Opératrice dispo</th>
                <th>Téléphone</th>
                <th>Étape</th>
                <th>Statut</th>
                <th>Attente</th>
                <th>Parole</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((row) => (
                <tr key={row.id}>
                  <td className="clickableCell" onClick={() => openNex('Date', row.date, row)}>{row.date}</td>
                  <td className="clickableCell" onClick={() => openNex('Client', row.client, row)}>{row.client}</td>
                  <td className="clickableCell" onClick={() => openNex('Attribution', row.operator, row)}>{row.operator}</td>
                  <td className="clickableCell" onClick={() => openNex('Opératrice dispo', row.availableOperator || '-', row)}>{row.availableOperator || '-'}</td>
                  <td className="clickableCell" onClick={() => openNex('Téléphone', row.phone, row)}>{row.phone}</td>
                  <td className="clickableCell" onClick={() => openNex('Étape', row.step, row)}>{row.step}</td>
                  <td className="clickableCell" onClick={() => openNex('Statut', row.status, row)}>{row.status}</td>
                  <td className="clickableCell" onClick={() => openNex('Attente', formatClock(row.wait), row)}>{formatClock(row.wait)}</td>
                  <td className="clickableCell" onClick={() => openNex('Parole', formatClock(row.talk), row)}>{formatClock(row.talk)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {nexCell && (
        <NexModal
          title="Explication de la cellule"
          column={nexCell.column}
          value={nexCell.value}
          row={nexCell.row}
          onClose={() => setNexCell(null)}
        />
      )}
    </div>
  );
}
