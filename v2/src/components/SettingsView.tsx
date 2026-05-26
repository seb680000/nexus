import type { Service, UserRow, ViewKey } from '../types';
import { DataTable } from './DataTable';
import { Panel } from './Panel';

const settingsSections: { key: ViewKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'monthly', label: 'Stats mensuelles' },
  { key: 'clients', label: 'Clients' },
  { key: 'operators', label: 'Operatrices' },
  { key: 'abandoned', label: 'Abandonnes' },
  { key: 'settings', label: 'Parametres' },
];

const services: Service[] = ['premium', 'forfait', 'autre'];

type SettingsViewProps = {
  users: UserRow[];
  setUsers: (users: UserRow[]) => void;
  newEmail: string;
  setNewEmail: (value: string) => void;
  addUser: () => void;
  settingsSection: ViewKey;
  setSettingsSection: (value: ViewKey) => void;
  callbackFamilies: Service[];
  toggleFamily: (service: Service) => void;
  minAbandon: number;
  setMinAbandon: (value: number) => void;
  minCallback: number;
  setMinCallback: (value: number) => void;
  minUserCallback: number;
  setMinUserCallback: (value: number) => void;
};

export function SettingsView({
  users,
  setUsers,
  newEmail,
  setNewEmail,
  addUser,
  settingsSection,
  setSettingsSection,
  callbackFamilies,
  toggleFamily,
  minAbandon,
  setMinAbandon,
  minCallback,
  setMinCallback,
  minUserCallback,
  setMinUserCallback,
}: SettingsViewProps) {
  function updateUser(id: number, key: keyof UserRow, value: unknown) {
    setUsers(users.map((user) => (user.id === id ? { ...user, [key]: value } : user)));
  }

  return (
    <Panel title="Parametres">
      <div className="settingsActions">
        {settingsSections.map((section) => (
          <button
            key={section.key}
            className={settingsSection === section.key ? 'small activeNav' : 'small'}
            onClick={() => setSettingsSection(section.key)}
          >
            Parametres {section.label}
          </button>
        ))}
      </div>

      {settingsSection === 'abandoned' && (
        <section className="panel">
          <h2>Abandons</h2>
          <p>Regles utilisees par les rappels restants, les rappels realises et le statut des abandons.</p>

          <div className="settingsActions">
            {services.map((service) => (
              <label key={service}>
                <input
                  type="checkbox"
                  checked={callbackFamilies.includes(service)}
                  onChange={() => toggleFamily(service)}
                />{' '}
                {service}
              </label>
            ))}

            <label>
              Abandon &gt;
              <input type="number" value={minAbandon} onChange={(event) => setMinAbandon(Number(event.target.value))} /> sec
            </label>

            <label>
              Rappel sortant &gt;=
              <input type="number" value={minCallback} onChange={(event) => setMinCallback(Number(event.target.value))} /> sec
            </label>

            <label>
              Rappel utilisateur utile &gt;=
              <input
                type="number"
                value={minUserCallback}
                onChange={(event) => setMinUserCallback(Number(event.target.value))}
              />{' '}
              sec
            </label>
          </div>
        </section>
      )}

      {settingsSection === 'settings' && (
        <section className="panel">
          <h2>Utilisateurs et droits</h2>

          <div className="settingsActions">
            <input placeholder="email utilisateur" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
            <button onClick={addUser}>Creer utilisateur</button>
          </div>

          <DataTable
            rows={users.map((user) => ({ ...user, actions: 'Supprimer' }))}
            columns={[
              ['email', 'Email'],
              ['name', 'Nom'],
              ['role', 'Role'],
              ['status', 'Statut'],
            ]}
            onOpen={(row) => setUsers(users.filter((user) => user.id !== row.id))}
          />

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  {settingsSections.map((section) => (
                    <th key={section.key}>{section.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    {settingsSections.map((section) => (
                      <td key={section.key}>
                        <input
                          type="checkbox"
                          checked={Boolean((user as any)[section.key])}
                          onChange={(event) => updateUser(user.id, section.key as keyof UserRow, event.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!['abandoned', 'settings'].includes(settingsSection) && (
        <section className="panel">
          <h2>{settingsSections.find((section) => section.key === settingsSection)?.label}</h2>
          <p>Section reservee aux options de cet onglet.</p>
        </section>
      )}
    </Panel>
  );
}
