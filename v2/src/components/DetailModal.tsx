import type { DetailItem } from '../types';
import { formatClock } from '../utils/format';

type DetailModalProps = {
  rows: DetailItem[];
  onClose: () => void;
};

export function DetailModal({ rows, onClose }: DetailModalProps) {
  return (
    <div className="modalBackdrop">
      <div className="modal">
        <header>
          <h2>Detail du parcours appel</h2>
          <button onClick={onClose}>Fermer</button>
        </header>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Operatrice</th>
                <th>Telephone</th>
                <th>Etape</th>
                <th>Statut</th>
                <th>Attente</th>
                <th>Parole</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>{row.client}</td>
                  <td>{row.operator}</td>
                  <td>{row.phone}</td>
                  <td>{row.step}</td>
                  <td>{row.status}</td>
                  <td>{formatClock(row.wait)}</td>
                  <td>{formatClock(row.talk)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
