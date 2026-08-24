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
  500: {
    title: 'Erreur du service',
    description: "Le service de signature a rencontré une erreur inattendue.",
    hint: 'Si le problème persiste, consultez Administration → Diagnostic.',
  },
  502: {
    title: 'Autorité de certification injoignable',
    description: "Le service n'a pas pu contacter l'infrastructure PKI (EJBCA).",
    hint: 'Vérifiez son état dans Administration → Diagnostic.',
  },
  503: {
    title: 'Service indisponible',
    description: "Une dépendance nécessaire n'est pas démarrée.",
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

/** Message court, pour une notification. */
export function toToastText(error: unknown): string {
  const m = toMessage(error);
  return m.hint ? `${m.description} ${m.hint}` : m.description;
}
