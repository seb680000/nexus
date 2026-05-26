import { useState } from 'react';
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

export function DataTable({ rows, columns, onOpen }: DataTableProps) {
  const [nexCell, setNexCell] = useState<NexCell>(null);

  return (
    <>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {columns.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map(([key, label]) => (
                  <td
                    key={key}
                    className="clickableCell"
                    onClick={() => setNexCell({ column: label, value: row[key], row })}
                    title="Cliquer pour l'explication NEX"
                  >
                    {row[key]}
                  </td>
                ))}
                <td>
                  <button className="small" onClick={() => onOpen(row)}>
                    {row.actions || 'Ouvrir'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </>
  );
}
