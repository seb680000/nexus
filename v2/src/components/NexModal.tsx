type NexModalProps = {
  title: string;
  column: string;
  value: unknown;
  row: Record<string, unknown>;
  onClose: () => void;
};

const sentimentMethodKeyByColumn: Record<string, string> = {
  'sentiment ia': 'sentimentMethod',
  'qualite prise': 'priseScoreMethod',
  'qualité prise': 'priseScoreMethod',
  abandons: 'abandonsScoreMethod',
  'attente moy.': 'attenteScoreMethod',
  'parole moy.': 'paroleScoreMethod',
  'effort parking': 'parkingScoreMethod',
  'reprise parking': 'repriseParkingScoreMethod',
  'effort rappel': 'rappelScoreMethod',
  'sortants utiles': 'sortantsScoreMethod',
  'activite relative': 'activiteScoreMethod',
  'activité relative': 'activiteScoreMethod',
  'explication nex': 'sentimentDetail',
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function explainSentimentCell(column: string, value: unknown, row: Record<string, unknown>) {
  const methodKey = sentimentMethodKeyByColumn[normalize(column)];
  if (!methodKey) return '';

  const method = String(row[methodKey] || '');
  const operator = String(row.label || row.Operatrice || row.operatrice || 'cette opératrice');
  const displayed = String(value ?? '-');

  if (normalize(column) === 'sentiment ia') {
    return [
      `Cette cellule affiche le Sentiment IA de ${operator} : ${displayed}.`,
      'Il ne s’agit pas d’un score de volume brut. La note est une moyenne pondérée de plusieurs sous-notes, afin de limiter les discussions liées aux plannings différents ou aux plages plus ou moins chargées.',
      method,
    ].filter(Boolean).join('\n\n');
  }

  if (normalize(column) === 'explication nex') {
    return [
      `Cette cellule détaille toute la méthode de calcul du Sentiment IA de ${operator}.`,
      method || String(value ?? '-'),
    ].filter(Boolean).join('\n\n');
  }

  return [
    `Cette cellule affiche la sous-note ${column} de ${operator} : ${displayed}.`,
    'Cette sous-note alimente le Sentiment IA global. Elle est calculée uniquement avec les données de la période et des filtres sélectionnés.',
    method,
  ].filter(Boolean).join('\n\n');
}

function explainCell(column: string, value: unknown, row: Record<string, unknown>) {
  const textValue = String(value ?? '-');
  const lowerColumn = column.toLowerCase();
  const sentimentExplanation = explainSentimentCell(column, value, row);

  if (sentimentExplanation) return sentimentExplanation;

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
          <p className="nexExplanationText">{explainCell(column, value, row)}</p>
        </section>
      </div>
    </div>
  );
}
