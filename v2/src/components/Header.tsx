import { Upload } from 'lucide-react';
import type { ViewKey } from '../types';
import { frDate } from '../utils/dates';

const viewLabels: Record<ViewKey, string> = {
  dashboard: 'Dashboard',
  monthly: 'Stats mensuelles',
  clients: 'Clients',
  operators: 'Operatrices',
  abandoned: 'Abandonnes',
  settings: 'Parametres',
};

type HeaderProps = {
  activeView: ViewKey;
  anchor: Date | null;
  onFile: (file: File) => void;
};

export function Header({ activeView, anchor, onFile }: HeaderProps) {
  return (
    <header className="topbar">
      <div>
        <h1>{viewLabels[activeView]}</h1>
        <p>Date de reference : {frDate(anchor)}.</p>
      </div>

      <label className="uploadButton">
        <Upload size={18} /> Importer export 3CX
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}
        />
      </label>
    </header>
  );
}
