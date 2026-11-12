# Guide opérationnel

Ce guide décrit les actions qui nécessitent un opérateur. Les détails d'implémentation et
les règles métier restent dans le code et les tests.

## Configuration locale

Copier [`.env.example`](../.env.example) vers `.env`, puis renseigner `RIOT_API_KEY` pour
les commandes qui appellent Riot. Ne jamais committer `.env`, afficher la clé dans les
logs ou la transmettre dans un rapport. `DATABASE_PATH` vaut `./etoiles.db` par défaut ;
la base locale est ignorée par Git.

`PLAYERS` est une liste de Riot IDs séparés par des virgules. `RIOT_PLATFORM` concerne
League-V4 (rang) et vaut `euw1` par défaut. `INGEST_ENABLED` accepte uniquement `true`
ou `false` ; il reste à `false` par défaut.

## Synchroniser les données

### Initialisation

```sh
npm run sync -- setup "Joueur 1#EUW" "Joueur 2#EUW" "Joueur 3#EUW" "Joueur 4#EUW" "Joueur 5#EUW"
```

Résout et enregistre les Riot IDs. Sans arguments, la commande lit `PLAYERS`. Les IDs
fournis en arguments remplacent cette liste pour la commande, mais ne suppriment pas les
joueurs déjà enregistrés.

### Collecte incrémentale

```sh
npm run sync -- update
```

Récupère les nouveautés Flex, Solo/Duo, les rangs du jour et les timelines en attente.

### Backfill historique

```sh
npm run sync -- history
```

Traite un lot reprenable. Pour répéter les lots dans un budget de programmation :

```sh
npm run sync -- history --max-duration 120
```

Le budget doit être positif et ne peut dépasser 86 400 secondes. Ce n'est pas une limite
stricte de durée murale : une requête Riot déjà commencée peut le dépasser. Chaque lot
est borné ; les pages et IDs déjà persistés sont repris au prochain lancement.

Un lot de backfill parcourt au plus deux pages de 100 IDs par joueur et par file, traite
au plus 100 détails de match et collecte au plus 10 timelines. Le statut indique ce qui
reste ; une collecte incomplète n'est pas nécessairement une erreur.

Un lot réussi ne signifie pas que le backfill est fini. L'historique est terminé lorsque
les curseurs Flex et Solo/Duo et les files de détails et de timelines sont traités.
Consulter le statut plutôt que d'inférer la fin à partir du code de sortie.

### Rattrapage d'une période

```sh
npm run sync -- history --since 2026-11-07 --max-duration 120
```

Rescanne les files Flex et Solo/Duo depuis `00:00 UTC` à cette date, sans modifier les
curseurs incrémentaux ou historiques. Après une interruption, la fenêtre repart de sa
première page ; les IDs déjà collectés sont dédupliqués. La date doit être valide et ne
pas être dans le futur.

### État de la synchronisation

```sh
npm run sync -- status
```

Affiche les curseurs par joueur et file, les détails et timelines en attente, les reprises
différées et la prochaine action. `status` et `help` ne requièrent pas de clé Riot.

Les appels Riot sont limités et peuvent être différés. En cas d'échec, lire le message et
le statut, respecter la pause indiquée — notamment sur HTTP 429 — puis relancer la
commande appropriée. Ne pas lancer plusieurs reprises en boucle. Un échec est visible et
la commande de synchronisation renvoie un code non nul. `LOG_LEVEL=silent` masque les
informations de progression, pas les erreurs.

### Assets

```sh
npm run syncAssets
```

Télécharge et vérifie les assets Riot/Data Dragon nécessaires au build. Versionner les
changements générés sous `public/` et les noms français de champions avant de reconstruire.

## Déploiement Railway

### Préparer le service

1. Connecter le service Railway au dépôt et conserver le `Dockerfile` et la commande de
   démarrage du projet.
2. Attacher un volume persistant au **même service**, monté sur `/data`.
3. Configurer les variables suivantes :

   | Variable | Valeur |
   | --- | --- |
   | `DATABASE_PATH` | `/data/etoiles.db` |
   | `INGEST_ENABLED` | `false` (pendant l'initialisation) |
   | `RIOT_API_KEY` | Clé valide (secret Railway) |

   Configurer aussi `RIOT_PLATFORM` et les cinq Riot IDs via `PLAYERS` si nécessaire.
   Ne pas copier `.env` dans Railway ni mettre de secret dans une variable publique.
4. Utiliser `/health` comme healthcheck, avec un timeout de 120 secondes, une seule
   instance et la politique de redémarrage `On Failure`. Ne pas créer un cron séparé :
   il ne partagerait pas le volume SQLite du service.
5. Déployer, puis vérifier `/health` (200), `/` et `/api/sync.json`. Une base encore vide
   peut être saine ; vérifier séparément que la synchronisation a réellement abouti.

Le démarrage exige le volume persistant et refuse une base située hors de celui-ci.
L'image et la configuration du serveur sont définies par le [Dockerfile](../Dockerfile).

### Initialiser depuis le conteneur

L'ingestion doit écrire sur le volume monté : ouvrir un shell **dans le service déployé**
avec `railway ssh`, puis lancer :

```sh
cd /app
npm run sync -- setup "Joueur 1#EUW" "Joueur 2#EUW" "Joueur 3#EUW" "Joueur 4#EUW" "Joueur 5#EUW"
npm run sync -- history --max-duration 120
npm run sync -- status
```

`railway run` lance une commande localement avec des variables distantes ; ce n'est pas
un substitut à `railway ssh` pour écrire sur le disque du service. Répéter le backfill
selon le statut, en respectant les reprises différées. Vérifier les vraies données dans
le site et `/api/sync.json`.

Pour une synchronisation incrémentale manuelle, toujours dans le conteneur :

```sh
npm run sync -- update
npm run sync -- status
```

Les commandes qui modifient la base utilisent un verrou SQLite commun ; une commande
concurrente échoue plutôt que de synchroniser en parallèle.

### Activer la synchronisation planifiée

Ne l'activer qu'après validation du déploiement et réussite d'une ingestion manuelle.
Au démarrage, le serveur vérifie la clé Riot, exactement cinq joueurs enregistrés et un
run réussi, puis attend que le healthcheck local réponde. Ensuite :

1. Passer `INGEST_ENABLED=true` dans Railway
2. Redéployer

La collecte s'exécute chaque jour à **04:00 UTC** (05:00 en hiver, 06:00 en été à Paris),
sans collecte immédiate au démarrage. Après une interruption, le prochain horaire est
programmé ; les horaires manqués ne sont pas rattrapés automatiquement. Un échec est
journalisé et la prochaine tentative planifiée a lieu au prochain créneau. Vérifier
`/api/sync.json`, `/health` et les logs séparément : une panne Riot ne signifie pas à elle
seule que le serveur web est indisponible.

Pour désactiver le planning, remettre `INGEST_ENABLED=false` et redéployer.

## Sauvegardes et restauration

- Un volume persistant n'est pas une sauvegarde : activer les sauvegardes du volume
  Railway et tester une restauration sur un service isolé, sans planning actif.
- Pour transférer manuellement une base, créer un snapshot SQLite cohérent, par exemple
  via l'API `backup()` de `better-sqlite3`, puis le copier lorsque le service cible est
  arrêté.
- Ne pas copier uniquement `etoiles.db` pendant que SQLite écrit : avec le mode WAL,
  des transactions récentes peuvent encore se trouver dans `etoiles.db-wal`.
- Après redémarrage ou restauration, vérifier que roster, historique, statut de sync et
  healthcheck sont cohérents avant d'activer le planning.

## Références Railway

- [Volumes Railway](https://docs.railway.com/volumes)
- [Healthchecks](https://docs.railway.com/deployments/healthchecks)
- [Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [SSH](https://docs.railway.com/cli/ssh)
