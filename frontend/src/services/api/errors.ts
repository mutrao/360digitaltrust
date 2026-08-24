/**
 * Traduction des erreurs API en messages destinés à des humains.
 *
 * Règle : l'utilisateur ne voit jamais un code HTTP nu ni une trace.
 * Il voit ce qui s'est passé et ce qu'il peut faire.
 */

export class ApiError extends Error {
  readonly status: number;
  /** Détail technique du backend — journalisable, jamais affiché tel quel. */
  readonly detail: string;
  readonly url: string;

  constructor(status: number, detail: string, url: string) {
    super(detail || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.url = url;
  }

  /** Une nouvelle tentative a-t-elle une chance d'aboutir ? */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Erreur réseau : le backend n'a pas répondu du tout. */
export class NetworkError extends ApiError {
  constructor(url: string, cause: string) {
    super(0, cause, url);
    this.name = 'NetworkError';
  }
}

interface Message {
  title: string;
  description: string;
  /** Action corrective proposée à l'utilisateur, si elle existe. */
  hint?: string;
}

const BY_STATUS: Record<number, Message> = {
  0: {
    title: 'Service injoignable',
    description:
      "L'application n'a pas pu contacter le service de signature. " +
      'Il est peut-être en cours de démarrage.',
    hint: 'Réessayez dans quelques instants.',
  },
  400: {
    title: 'Demande invalide',
    description: "Les informations envoyées n'ont pas pu être traitées.",
    hint: 'Vérifiez les champs saisis.',
  },
  401: {
    title: 'Session expirée',
    description: 'Votre session a pris fin. Reconnectez-vous pour continuer.',
  },
  403: {
    title: 'Accès refusé',
    description: "Vous n'avez pas les droits nécessaires pour cette action.",
    hint: 'Contactez un administrateur si vous pensez que c’est une erreur.',
  },
  404: {
    title: 'Élément introuvable',
    description: "Cet élément n'existe pas ou n'est plus disponible.",
  },
  409: {
    title: 'Action impossible',
    description:
      'Cette demande ne peut plus être modifiée car le processus de ' +
      'signature a déjà commencé.',
  },
  422: {
    title: 'Informations incomplètes',
    description: 'Certains champs obligatoires sont manquants ou mal renseignés.',
  },
  429: {
    title: 'Trop de demandes',
    description: 'Vous avez effectué trop d’opérations en peu de temps.',
    hint: 'Patientez une minute avant de réessayer.',
  },
  405: {
    title: 'Opération non autorisée',
    description:
      "Le service a refusé cette opération. L'interface et le service de " +
      'signature ne sont probablement pas dans la même version.',
    hint: 'Consultez Administration → Diagnostic pour comparer les versions.',
  },
  408: {
    title: 'Délai dépassé',
    description: "Le service n'a pas répondu dans le temps imparti.",
    hint: 'Réessayez ; le service est peut-être surchargé.',
  },
  413: {
    title: 'Contenu trop volumineux',
    description: 'Les données envoyées dépassent la taille acceptée par le service.',
  },
  415: {
    title: 'Format refusé',
    description: "Le service n'accepte pas le format des données envoyées.",
  },
  500: {
    title: 'Erreur du service',
    description: 'Le service de signature a rencontré une erreur inattendue.',
    hint: 'Si le problème persiste, consultez Administration → Diagnostic.',
  },
  501: {
    title: 'Fonctionnalité absente',
    description: "Le service de signature ne propose pas cette opération.",
  },
  // 502 vient du reverse proxy : c'est l'API elle-même qui ne répond pas.
  // Ne pas confondre avec une erreur EJBCA, que l'API renvoie elle-même en 502
  // — le message reste donc volontairement neutre sur la cause exacte.
  502: {
    title: 'Service de signature injoignable',
    description:
      "Le service n'a pas répondu. Il est peut-être en cours de démarrage ou " +
      "une de ses dépendances (PKI, cache) est indisponible.",
    hint: 'Vérifiez son état dans Administration → Diagnostic.',
  },
  503: {
    title: 'Service indisponible',
    description: "Une dépendance nécessaire n'est pas démarrée.",
  },
  504: {
    title: 'Délai dépassé',
    description:
      "Le service de signature a mis trop de temps à répondre et la requête a " +
      'été interrompue.',
    hint: 'Réessayez ; si cela se reproduit, consultez ses journaux.',
  },
};

/**
 * Cas métier reconnaissables au détail renvoyé par le backend.
 * Testés dans l'ordre : le premier motif trouvé gagne.
 */
const BY_DETAIL: Array<{ match: RegExp; message: Message }> = [
  {
    match: /Vault/i,
    message: {
      title: 'Vault non disponible',
      description:
        "Le coffre-fort HashiCorp Vault n'est pas démarré ou n'est pas joignable.",
      hint: 'Choisissez le stockage local, ou démarrez Vault puis redémarrez le service de signature.',
    },
  },
  {
    match: /Clé .* introuvable|key.*not found/i,
    message: {
      title: 'Clé de signature introuvable',
      description:
        "La clé utilisée pour signer n'existe plus. Elle a pu être générée " +
        'dans un autre mode de stockage, ou le service a été recréé.',
      hint: 'Générez une nouvelle clé dans Clés & certificats.',
    },
  },
  {
    match: /En attente de la signature de l'ordre (\d+)/i,
    message: {
      title: 'Ce n’est pas encore votre tour',
      description:
        'Cette demande est séquentielle : un signataire précédent doit signer avant vous.',
    },
  },
  {
    match: /Déjà signé/i,
    message: {
      title: 'Document déjà signé',
      description: 'Vous avez déjà signé cette demande.',
    },
  },
  {
    match: /Signataire non autorisé/i,
    message: {
      title: 'Signataire non reconnu',
      description: 'Vous ne figurez pas parmi les signataires de cette demande.',
    },
  },
  {
    match: /Workflow déjà complété|Impossible d'annuler/i,
    message: {
      title: 'Demande déjà finalisée',
      description:
        'Toutes les signatures requises ont été apposées : cette demande ne peut plus être modifiée.',
    },
  },
  {
    match: /Hash invalide/i,
    message: {
      title: 'Empreinte invalide',
      description:
        "L'empreinte du document ne correspond pas à l'algorithme choisi.",
      hint: 'Rechargez le document et réessayez.',
    },
  },
];

const UNKNOWN: Message = {
  title: 'Une erreur est survenue',
  description: "L'opération n'a pas pu être menée à son terme.",
  hint: 'Réessayez ; si le problème persiste, contactez votre administrateur.',
};

/** Convertit n'importe quelle erreur en message affichable. */
export function toMessage(error: unknown): Message {
  if (error instanceof ApiError) {
    for (const { match, message } of BY_DETAIL) {
      if (match.test(error.detail)) return message;
    }
    return BY_STATUS[error.status] ?? UNKNOWN;
  }
  return UNKNOWN;
}

/**
 * Référence technique courte, à citer lors d'un signalement.
 *
 * Sans elle, un incident ne laisse aucune trace exploitable : l'utilisateur
 * rapporte « ça ne marche pas » et personne ne peut remonter à la cause.
 * Elle ne contient ni jeton, ni donnée métier — seulement de quoi situer
 * l'appel qui a échoué.
 */
export function toReference(error: unknown): string | null {
  if (error instanceof NetworkError) return 'réseau';
  if (error instanceof ApiError) return `HTTP ${error.status}`;
  if (error instanceof Error) return error.name;
  return null;
}

/**
 * Journalise le détail technique pour le diagnostic.
 *
 * Le détail n'est jamais affiché (voir docs/SECURITY.md §8) mais le perdre
 * complètement rend tout incident inanalysable. La console est le bon endroit :
 * accessible à qui dépanne, invisible pour qui utilise.
 */
export function logError(context: string, error: unknown): void {
  if (error instanceof ApiError) {
    console.error(
      `[360DT] ${context} — ${error.status} ${error.url}`,
      error.detail || '(aucun détail)',
    );
    return;
  }
  console.error(`[360DT] ${context} — erreur inattendue`, error);
}

/** Message court, pour une notification. Journalise le détail au passage. */
export function toToastText(error: unknown, context = 'appel API'): string {
  logError(context, error);

  const m = toMessage(error);
  const base = m.hint ? `${m.description} ${m.hint}` : m.description;
  const ref = toReference(error);
  return ref ? `${base} (réf. ${ref})` : base;
}
