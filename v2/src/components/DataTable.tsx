type Column = [string, string];

type DataTableProps = {
  rows: any[];
  columns: Column[];
  onOpen: (row: any) => void;
};

export function DataTable({ rows, columns, onOpen }: DataTableProps) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            {columns.map(([, label]) => (
              <th key={label}>{label}</th>
            ))}
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map(([key]) => (
                <td key={key}>{row[key]}</td>
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
  );
}
