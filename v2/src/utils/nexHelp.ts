export function nexMetricHelp(label: string) {
  const key = String(label || '').toLowerCase();

  if (key.includes('total a facturer') || key.includes('total à facturer')) {
    return "NEX : cet indicateur sert à estimer le volume facturable. Il additionne les appels entrants traités, les rappels opératrice reconnus et les appels sortants clients selon les seuils actifs.";
  }

  if (key.includes('appels traites') || key.includes('appels traités')) {
    return "NEX : cet indicateur mesure les appels entrants réellement pris en charge. Il permet de suivre la capacité de traitement par période, client ou opératrice.";
  }

  if (key.includes('abandon')) {
    return "NEX : cet indicateur montre les appels qui n'ont pas abouti à une prise en charge. Il sert à repérer les pertes potentielles et à piloter les rappels restants.";
  }

  if (key.includes('total entrants')) {
    return "NEX : cet indicateur regroupe les appels entrants traités et abandonnés. Il donne le volume global d'appels reçus sur la période filtrée.";
  }

  if (key.includes('sortants')) {
    return "NEX : cet indicateur compte les appels sortants clients répondus qui respectent le seuil de durée. Il permet de mesurer l'activité d'appel émise par les opératrices.";
  }

  if (key.includes('rappels realises') || key.includes('rappels réalisés')) {
    return "NEX : cet indicateur compte les abandons qui ont ensuite été rappelés par une opératrice. Il vérifie que le rappel sortant correspond au même numéro et respecte le seuil de durée.";
  }

  if (key.includes('rappels restants')) {
    return "NEX : cet indicateur affiche les abandons encore à rappeler selon les paramètres actifs : famille, temps d'abandon minimum et absence de rappel utile.";
  }

  if (key.includes('inter-collab')) {
    return "NEX : cet indicateur compte les appels internes entre collaborateurs. Il permet d'isoler l'activité interne de l'activité client.";
  }

  if (key.includes('attente max')) {
    return "NEX : cet indicateur montre le plus long temps d'attente constaté. Il aide à repérer les pics de tension ou les moments où un appel a trop attendu.";
  }

  if (key.includes('attente moy')) {
    return "NEX : cet indicateur donne l'attente moyenne. Il sert à suivre la qualité de prise en charge et la fluidité du flux d'appels.";
  }

  if (key.includes('parole moy')) {
    return "NEX : cet indicateur donne la durée moyenne de conversation. Il aide à comprendre le temps réellement passé avec les appelants.";
  }

  if (key.includes('dates csv')) {
    return "NEX : cette case indique combien de journées sont présentes dans le fichier importé et la plage de dates analysée.";
  }

  return `NEX : cette donnée correspond à ${label}. Elle est recalculée selon les filtres actifs : période, client, opératrice et paramètres métier.`;
}

export function nexColumnHelp(column: string, value: unknown) {
  const key = String(column || '').toLowerCase();
  const textValue = String(value ?? '-');

  if (key.includes('statut')) return `NEX : le statut explique l'état de traitement de cette ligne. Ici : ${textValue}. Il indique si l'appel est répondu, abandonné, non répondu, transféré ou encore à rappeler.`;
  if (key.includes('date')) return `NEX : cette cellule situe l'événement dans le temps. Ici : ${textValue}. Elle sert à rattacher l'appel à la bonne période.`;
  if (key.includes('client')) return `NEX : cette cellule indique le client ou l'appelant reconnu. Ici : ${textValue}. Elle sert aux filtres clients et aux analyses par portefeuille.`;
  if (key.includes('téléphone') || key.includes('telephone')) return `NEX : ce numéro sert à relier les appels entre eux. Ici : ${textValue}. Nexus l'utilise pour retrouver les rappels opératrice ou les rappels utilisateur.`;
  if (key.includes('famille')) return `NEX : cette famille classe l'appel pour les règles de rappel et de comptabilisation. Ici : ${textValue}.`;
  if (key.includes('attente')) return `NEX : cette durée correspond au temps d'attente ou de file. Ici : ${textValue}. Elle influence les abandons, l'attente moyenne et l'attente maximale.`;
  if (key.includes('parole')) return `NEX : cette durée correspond au temps de conversation réel. Ici : ${textValue}. Elle sert aux seuils d'appels sortants et aux moyennes de parole.`;
  if (key.includes('rappel opératrice') || key.includes('rappel operatrice')) return `NEX : cette cellule indique si une opératrice a rappelé le numéro après un abandon. Ici : ${textValue}.`;
  if (key.includes('utilisateur')) return `NEX : cette cellule indique si l'appelant a lui-même rappelé ensuite. Ici : ${textValue}. Cela peut éviter de compter l'appel comme restant à rappeler.`;
  if (key.includes('sondé') || key.includes('sonde')) return `NEX : cette cellule compare les sollicitations d'une opératrice avec les appels effectivement pris. Ici : ${textValue}.`;

  return `NEX : valeur affichée dans la colonne ${column} : ${textValue}. Elle dépend des filtres et des règles métier actives.`;
}
