import { CalendarDays } from 'lucide-react';
import type { PeriodMode, Service } from '../types';

type GlobalFiltersProps = {
  periodMode: PeriodMode;
  setPeriodMode: (value: PeriodMode) => void;
  effectiveStart: string;
  setCustomStart: (value: string) => void;
  effectiveEnd: string;
  setCustomEnd: (value: string) => void;
  client: string;
  setClient: (value: string) => void;
  clients: string[];
  family: 'all' | Service;
  setFamily: (value: 'all' | Service) => void;
  selectedOperators: string[];
  toggleOperator: (operator: string) => void;
  operators: string[];
};

export function GlobalFilters({
  periodMode,
  setPeriodMode,
  effectiveStart,
  setCustomStart,
  effectiveEnd,
  setCustomEnd,
  client,
  setClient,
  clients,
  family,
  setFamily,
  selectedOperators,
  toggleOperator,
  operators,
}: GlobalFiltersProps) {
  return (
    <section className="filters">
      <label>
        Periode
        <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as PeriodMode)}>
          <option value="custom">Personnalise</option>
          <option value="day">Jour</option>
          <option value="week">Semaine</option>
          <option value="month">Mois</option>
          <option value="quarter">Trimestre</option>
          <option value="year">Annee</option>
        </select>
      </label>

      {periodMode === 'custom' && (
        <>
          <label>
            Debut
            <input type="date" value={effectiveStart} onChange={(event) => setCustomStart(event.target.value)} />
          </label>
          <label>
            Fin
            <input type="date" value={effectiveEnd} onChange={(event) => setCustomEnd(event.target.value)} />
          </label>
        </>
      )}

      <label>
        Client
        <select value={client} onChange={(event) => setClient(event.target.value)}>
          <option value="all">Tous</option>
          {clients.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>

      <label>
        Famille client
        <select value={family} onChange={(event) => setFamily(event.target.value as 'all' | Service)}>
          <option value="all">Tous</option>
          <option value="premium">Premium</option>
          <option value="forfait">Forfait</option>
        </select>
      </label>

      <div className="operatorFilter">
        <span>Operatrice</span>
        <div className="operatorBox">
          <label>
            <input type="checkbox" checked={selectedOperators.includes('all')} onChange={() => toggleOperator('all')} /> Toutes
          </label>
          {operators.map((operator) => (
            <label key={operator}>
              <input
                type="checkbox"
                checked={!selectedOperators.includes('all') && selectedOperators.includes(operator)}
                onChange={() => toggleOperator(operator)}
              />{' '}
              {operator}
            </label>
          ))}
        </div>
      </div>

      <div className="periodHint">
        <CalendarDays size={16} /> Un clic coche ou decoche une operatrice.
      </div>
    </section>
  );
}
