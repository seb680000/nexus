import type { Service, UserRow, UserType, UserViewMode, ViewKey } from '../types';
import { Panel } from './Panel';

const settingsSections: { key: ViewKey; label: string }[] = [
  { key: 'settings', label: 'Parametre utilisateur' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'monthly', label: 'Stats mensuelles' },
  { key: 'clients', label: 'Clients' },
  { key: 'operators', label: 'Operatrices' },
  { key: 'abandoned', label: 'Abandons' },
];

const services: Service[] = ['premium', 'forfait', 'autre'];
const userTypes: UserType[] = ['Operatrice', 'Responsable', 'Admin', 'Autre'];
const viewModes: UserViewMode[] = ['Vue solo', 'Vue equipe'];

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

function blankUser(): UserRow {
  return {
    id: Date.now(),
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    userType: 'Operatrice',
    viewMode: 'Vue solo',
    name: '',
    role: 'user',
    status: 'active',
    dashboard: true,
    monthly: false,
    clients: false,
    operators: false,
    abandoned: false,
    settings: false,
  };
}

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
    setUsers(users.map((user) => {
      if (user.id !== id) return user;
      const next = { ...user, [key]: value };
      next.name = `${next.firstName || ''} ${next.lastName || ''}`.trim() || next.name;
      next.role = next.userType;
      return next;
    }));
  }

  function createUser() {
    const user = blankUser();
    user.email = newEmail.trim();
    setUsers([...users, user]);
    setNewEmail('');
  }

  function deleteUser(id: number) {
    setUsers(users.filter((user) => user.id !== id));
  }

  return (
    <Panel title="Parametre utilisateur">
      <div className="settingsActions">
        {settingsSections.map((section) => (
          <button
            key={section.key}
            className={settingsSection === section.key ? 'small activeNav' : 'small'}
            onClick={() => setSettingsSection(section.key)}
          >
            {section.label}
          </button>
        ))}
      </div>

      {settingsSection === 'settings' && (
        <section className="panel">
          <h2>Parametre utilisateur</h2>
          <p>Creation, modification et suppression des utilisateurs. Les operatrices sont gerees directement dans cette liste.</p>

          <div className="settingsActions">
            <input placeholder="adresse mail" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
            <button onClick={newEmail.trim() ? createUser : addUser}>Creer utilisateur</button>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Prenom</th>
                  <th>Adresse mail</th>
                  <th>Mot de passe</th>
                  <th>Type utilisateur</th>
                  <th>Vue</th>
                  <th>Statut</th>
                  <th>Creer / Modifier</th>
                  <th>Supprimer</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><input value={user.lastName || ''} onChange={(event) => updateUser(user.id, 'lastName', event.target.value)} /></td>
                    <td><input value={user.firstName || ''} onChange={(event) => updateUser(user.id, 'firstName', event.target.value)} /></td>
                    <td><input value={user.email || ''} onChange={(event) => updateUser(user.id, 'email', event.target.value)} /></td>
                    <td><input type="password" value={user.password || ''} onChange={(event) => updateUser(user.id, 'password', event.target.value)} /></td>
                    <td>
                      <select value={user.userType || 'Operatrice'} onChange={(event) => updateUser(user.id, 'userType', event.target.value as UserType)}>
                        {userTypes.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={user.viewMode || 'Vue solo'} onChange={(event) => updateUser(user.id, 'viewMode', event.target.value as UserViewMode)}>
                        {viewModes.map((mode) => <option key={mode}>{mode}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={user.status} onChange={(event) => updateUser(user.id, 'status', event.target.value)}>
                        <option value="active">Actif</option>
                        <option value="inactive">Inactif</option>
                      </select>
                    </td>
                    <td><button className="small" onClick={() => updateUser(user.id, 'status', user.status || 'active')}>Modifier</button></td>
                    <td><button className="small" onClick={() => deleteUser(user.id)}>Supprimer</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  {settingsSections.filter((section) => section.key !== 'settings').map((section) => (
                    <th key={section.key}>{section.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}</td>
                    {settingsSections.filter((section) => section.key !== 'settings').map((section) => (
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

      {settingsSection === 'abandoned' && (
        <section className="panel">
          <h2>Abandons</h2>
          <p>Regles utilisees par les rappels restants, les rappels realises et le statut des abandons.</p>

          <div className="settingsActions">
            {services.map((service) => (
              <label key={service}>
                <input type="checkbox" checked={callbackFamilies.includes(service)} onChange={() => toggleFamily(service)} /> {service}
              </label>
            ))}
            <label>Abandon &gt;<input type="number" value={minAbandon} onChange={(event) => setMinAbandon(Number(event.target.value))} /> sec</label>
            <label>Rappel sortant &gt;=<input type="number" value={minCallback} onChange={(event) => setMinCallback(Number(event.target.value))} /> sec</label>
            <label>Rappel utilisateur utile &gt;=<input type="number" value={minUserCallback} onChange={(event) => setMinUserCallback(Number(event.target.value))} /> sec</label>
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
