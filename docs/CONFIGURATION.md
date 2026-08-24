# Configuration

Toute la configuration client est appliquée **au démarrage du conteneur**.
Changer une valeur ne demande jamais de reconstruire l'image.

## Comment cela fonctionne

```
Variables d'environnement
        │
        ▼  docker-entrypoint.sh (au démarrage)
/config/runtime-config.json
        │
        ▼  fetch, avant le montage de React
Application configurée
```

Le bundle JavaScript ne contient aucune URL client. Une même image sert donc
tous les déploiements.

## Variables

Tableau complet : [`DEPLOYMENT.md`](DEPLOYMENT.md) §3.

## Vérifier la configuration effective

```bash
curl -s http://localhost:3001/config/runtime-config.json | jq
```

Ou dans l'interface : **Administration → Organisation** et
**Administration → Diagnostic**.

## Validation

Les valeurs reçues sont validées avant application (`src/lib/config.ts`) :

- les URL doivent être `http`/`https` ou un chemin absolu — une valeur
  `javascript:…` est rejetée ;
- `BRANDING_ACCENT_RGB` doit être trois entiers ≤ 255 séparés par des espaces
  avant d'être écrit dans une variable CSS ;
- toute valeur invalide est ignorée au profit du défaut, sans faire échouer le
  démarrage.

## Aucun secret

Tout ce qui est fourni au frontend est lisible par l'utilisateur : c'est une
propriété du web. Le `client_secret` Keycloak n'a donc pas de variable — le
flux PKCE le rend inutile.
