type NexModalProps = {
  title: string;
  column: string;
  value: unknown;
  row: Record<string, unknown>;
  onClose: () => void;
};

function explainCell(column: string, value: unknown, row: Record<string, unknown>) {
  const textValue = String(value ?? '-');
  const lowerColumn = column.toLowerCase();

  if (lowerColumn.includes('statut')) {
    return `Cette cellule indique l'état métier ou téléphonique de la ligne. Valeur affichée : ${textValue}. Elle permet de savoir si l'appel est à traiter, traité, répondu, non répondu, abandonné ou transféré.`;
  }

  if (lowerColumn.includes('date')) {
    return `Cette cellule indique la date et l'heure de l'événement analysé. Valeur affichée : ${textValue}. Elle sert à replacer l'appel dans la période sélectionnée.`;
  }

  if (lowerColumn.includes('client')) {
    return `Cette cellule indique le client ou l'appelant identifié par Nexus. Valeur affichée : ${textValue}. Si le nom n'est pas reconnu, Nexus peut afficher un client non identifié ou un numéro.`;
  }

  if (lowerColumn.includes('téléphone') || lowerColumn.includes('telephone')) {
    return `Cette cellule contient le numéro de téléphone lié à l'appel. Valeur affichée : ${textValue}. Ce numéro sert notamment à retrouver les rappels opératrice et les rappels utilisateur.`;
  }

  if (lowerColumn.includes('famille')) {
    return `Cette cellule indique la famille de facturation ou de traitement : premium, forfait ou autre. Valeur affichée : ${textValue}. Ce classement influence les rappels restants selon les paramètres actifs.`;
  }

  if (lowerColumn.includes('attente')) {
    return `Cette cellule indique le temps passé avant traitement ou abandon. Valeur affichée : ${textValue}. Ce temps sert aux statistiques d'attente et aux règles de rappel des abandons.`;
  }

  if (lowerColumn.includes('parole')) {
    return `Cette cellule indique le temps de conversation réelle. Valeur affichée : ${textValue}. Elle sert aux moyennes de parole et aux seuils de qualification des appels sortants.`;
  }

  if (lowerColumn.includes('rappel opératrice') || lowerColumn.includes('rappel operatrice')) {
    return `Cette cellule indique si une opératrice a rappelé le numéro après un abandon. Valeur affichée : ${textValue}. Un rappel est reconnu si l'appel sortant est répondu et respecte le seuil de durée configuré.`;
  }

  if (lowerColumn.includes('utilisateur')) {
    return `Cette cellule indique si l'appelant a lui-même rappelé ensuite et si cet appel entrant a été décroché. Valeur affichée : ${textValue}. Cela évite de compter certains abandons comme rappels restants.`;
  }

  if (lowerColumn.includes('sondé') || lowerColumn.includes('sonde')) {
    return `Cette cellule compare le nombre de fois où une opératrice a été sollicitée avec le nombre de fois où elle a pris l'appel. Valeur affichée : ${textValue}.`;
  }

  if (lowerColumn.includes('total')) {
    return `Cette cellule affiche un volume total calculé selon les filtres actifs. Valeur affichée : ${textValue}.`;
  }

  return `Cette cellule affiche la valeur ${textValue} pour la colonne ${column}. Elle est calculée selon la période, le client et les opératrices sélectionnés.`;
}

export function NexModal({ title, column, value, row, onClose }: NexModalProps) {
  return (
    <div className="modalBackdrop">
      <div className="modal nexModal">
        <header>
          <div>
            <h2>NEX</h2>
            <p>{title}</p>
          </div>
          <button onClick={onClose}>Fermer</button>
        </header>

        <section className="nexBody">
          <h3>{column}</h3>
          <div className="nexValue">{String(value ?? '-')}</div>
          <p>{explainCell(column, value, row)}</p>
        </section>
      </div>
    </div>
  );
}
