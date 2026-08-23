# Reset complet — Tout remettre à zéro

> Utile quand la stack est dans un état incohérent et que vous voulez repartir proprement.

---

## Procédure complète

### Étape 1 — Arrêter et supprimer TOUT (containers + volumes + images du projet)

```bash
cd ~/Documents/360digitaltrust

# Arrêter tous les containers et supprimer les volumes
docker compose --profile vault down -v --remove-orphans

# Vérifier qu'il ne reste rien
docker ps -a | grep -E "pki|vault|ejbca|signature"
# Doit retourner vide
```

### Étape 2 — Supprimer les images construites localement

```bash
# Supprimer l'image SoftHSM2 et Signature API (reconstruites au prochain up)
docker images | grep 360digitaltrust
docker rmi $(docker images | grep 360digitaltrust | awk '{print $3}') 2>/dev/null || true

# Ou supprimer toutes les images inutilisées (plus agressif)
docker image prune -a
```

### Étape 3 — Supprimer les volumes Docker orphelins

```bash
docker volume ls | grep 360digitaltrust
docker volume prune -f
```

### Étape 4 — Supprimer le dossier local et recloner

```bash
cd ~/Documents
rm -rf 360digitaltrust
git clone https://github.com/mutrao/360digitaltrust.git
cd 360digitaltrust
```

### Étape 5 — Reconfigurer et redémarrer

```bash
cp .env.example .env
# Pas besoin d'éditer .env pour un test local basique

# Démarrer dans l'ordre
docker compose up -d pki-db pki-hsm
sleep 25
docker compose up -d pki-ca cache

# Suivre le démarrage EJBCA (3-5 min)
docker compose logs -f pki-ca
# Attendre : "A fresh installation was detected"
# Puis Ctrl+C

# Activer l'API REST EJBCA
docker compose exec pki-ca /opt/ejbca/bin/ejbca.sh config protocols \
  --enable --protocol REST

# Démarrer le reste
docker compose up -d
docker compose ps
```

---

## Reset rapide (garder les images, juste les volumes)

Si vous voulez seulement réinitialiser les données (PKI, base de données) sans re-télécharger les images :

```bash
docker compose --profile vault down -v --remove-orphans
docker compose up -d pki-db pki-hsm
sleep 25
docker compose up -d pki-ca cache
docker compose logs -f pki-ca
# Attendre le message de démarrage, puis Ctrl+C
docker compose up -d
```

---

## Vérification finale

```bash
# Tous les services doivent être healthy ou running
docker compose ps

# EJBCA doit répondre ALLOK
curl -sk https://localhost:8443/ejbca/publicweb/healthcheck/ejbcahealth

# Signature API doit répondre ok
curl http://localhost:8080/health
```
