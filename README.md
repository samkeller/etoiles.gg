# etoiles.win — Fait à cinq, pour les cinq. ✦

Le carnet de bord privé des **Étoiles de l'Esport** : comprendre les parties, préparer
la prochaine soirée et garder la mémoire de l'équipe.

## Démarrer en local

Prérequis : Node.js `>=22.23.4`.

```sh
npm ci
npm run dev
```

Le site est servi sur <http://localhost:4321>. L'interface est rendue côté serveur depuis
SQLite et propose plusieurs parcours reliés :

| Route | Parcours |
| --- | --- |
| `/` | Accueil éditorial, dernière soirée, forme collective, cinq profils et accès aux parcours |
| `/history` | Repères collectifs par année, picks marquants, chronologie des soirées et archives partielles séparées |
| `/players/{puuid}` | Statistiques du joueur dans les matchs à cinq, champions, présences par match; rang personnel secondaire |
| `/draft` | Table de draft à cinq sièges fixes : picks en un clic, historique et synergies observées à cinq, compositions jouées, bans habituels; état partageable via `?picks=` |
| `/matches/{id}` | URL permanente du récit de match : résultat, patch, composition, statistiques, objectifs et lien externe |

**Périmètres inviolables :** les statistiques collectives et les compositions observées
ne consomment que les matchs de la file Flex (`queue 440`) où les cinq joueurs sont
présents. Les matchs incomplets sont consultables à part. Les statistiques personnelles
classées lisent exclusivement les files Solo/Duo (`420`) et Flex (`440`) du joueur.

L'identité graphique privilégie le ciel nocturne, les constellations, l'or doux et une
typographie système; les polices Riot ne sont pas redistribuées. Les icônes de champions,
de profils et de rôles restent des ressources statiques du jeu. Le boilerplate légal Riot
reste visible dans le pied de page.

Les données sont aussi exposées en JSON (GET) :

| Route | Contenu |
| --- | --- |
| `/api/matches.json?scope=full\|partial` | Matchs Flex complets ou partiels |
| `/api/matches/{id}.json` | Détail de match (400 si l'id est invalide, 404 s'il est inconnu) |
| `/api/players.json` | Profils collectifs des cinq joueurs |
| `/api/sync.json` | Fraîcheur, résultats d'ingestion, file d'attente et planning |
| `/health` | Disponibilité du serveur et de SQLite en lecture/écriture (200 ou 503) |

Les tokens de la charte sont dans `src/styles/global.css`, les primitives réutilisables dans
`src/components/ui/` et les agrégations distinctes dans `src/lib/stats/`.

La progression de réalisation, les reports et les limites sont décrits dans
[`docs/V2 - Roadmap.md`](./docs/V2%20-%20Roadmap.md).

## Lire les observations et les historiques

Une association décrit deux joueurs avec leurs champions dans le même match à cinq;
une composition décrit les cinq joueurs, champions et rôles. Seuls les groupes joués
**au moins 5 fois à cinq** affichent un winrate. Les échantillons plus petits restent
des volumes descriptifs, jamais une synergie ni une recommandation. Les filtres de rôle
recalculent l'échantillon sur les rôles observés dans les matchs, sans toucher au bilan
collectif.

La table de draft place chaque joueur sur son rôle principal observé à cinq. Un à cinq
picks suffisent : le verdict ne compte que les parties Flex à cinq où ces joueurs ont joué
ces champions, puis détaille les paires déjà réunies. Les « pistes perso » viennent du
Solo/Duo ou du Flex individuel et sont présentées comme exploratoires. L'URL
`/draft?picks=A,B,,D,` suit l'ordre Top, Jungle, Mid, ADC, Support. Les échantillons de
moins de cinq restent des volumes descriptifs, jamais une recommandation.

Les soirées sont regroupées par une pause de quatre heures et datées selon le fuseau
Europe/Paris. Le filtre de période utilise l'année civile; il ne prétend pas reconstituer
les saisons compétitives historiques. Le patch est extrait de la version stockée dans
chaque réponse Match-V5 et comparé dans son ordre numérique.

Les liens externes de match restent League of Graphs. Aucun identifiant OP.GG n'est
fabriqué à partir d'un Match-V5.

## Commandes

| Commande | Action |
| --- | --- |
| `npm run dev` | Démarre Astro en développement |
| `npm run check` | Vérifie les types et composants Astro |
| `npm test` | Exécute les tests Vitest |
| `npm run build` | Construit le site de production |
| `npm start` | Démarre le serveur Node de production et le planificateur opt-in |
| `npm run preview` | Prévisualise le build |
| `npm run ingest` | Synchronise les nouveautés Flex, Solo/Duo et les rangs du jour |
| `npm run ingest:backfill` | Commence ou reprend le backfill historique classé par lots |
| `npm run ingest:status` | Affiche la file en attente et l’avancement des curseurs de backfill |
| `npm run resolvePuids -- "Pseudo#TAG"` | Résout le PUUID d'un joueur via son Riot ID et l'enregistre en base |
| `npm run syncAssets` | Télécharge les icônes de profil et de champions (Data Dragon) et génère les noms FR des champions |

## Fiabilité de la synchronisation

L'ingestion incrémentale utilise une fenêtre initiale de 24 heures puis un chevauchement de
24 heures sur ses curseurs Flex (`ingest_cursors`) et Solo/Duo (`individual_ingest_cursors`).
Le backfill explicite possède des curseurs de page indépendants pour chaque joueur et file;
chaque page de 100 IDs et son curseur sont enregistrés ensemble dans une transaction.
Chaque exécution backfill lit au plus deux pages par joueur/file et traite au plus 100
détails de match. Relancer `npm run ingest:backfill` reprend à la page persistée, sans
recommencer les pages terminées. `npm run ingest:status` permet de voir les files terminées,
celles restant à parcourir et les détails encore en attente. Le backfill est fini quand les
curseurs Flex et Solo/Duo sont terminés et qu'aucun match n'attend de détail.

Les IDs à traiter restent dans `ingest_pending`; chaque match et ses participants sont
écrits dans une transaction. Une erreur laisse l'ID en file, enregistre son nombre de
tentatives et applique un délai progressif avant réessai. Les délais Riot trop longs
respectent aussi un backoff renforcé. Les échecs restent visibles dans les logs et un run
comportant des erreurs est enregistré `failed`; une interruption ne détruit ni les IDs ni
les curseurs déjà persistés.
Les anciens matchs dont les participants sont incomplets sont aussi remis en file :
une réparation échouée conserve les données existantes et l'ID à reprendre.

Le client HTTP utilise un timeout de 30 secondes pour les appels Riot de collecte et de
rangs, et au plus trois retries pour les erreurs réseau, 429 et 5xx. Pour les appels Riot, il
respecte `Retry-After` jusqu'à cinq minutes par attente ; un backfill peut donc prendre
du temps. Si cette limite ou le nombre de
retries est dépassé sur un 429, le run s'arrête en échec sans multiplier les appels :
les IDs et pages déjà collectés restent persistés. Relancer `npm run ingest:backfill`
après la pause indiquée par `npm run ingest:status` reprend la collecte. La clé Riot et les IDs sont
validés avant les appels. Les assets sont vérifiés avant écriture (réponse HTTP et
signature PNG), remplacés atomiquement, et une
synchronisation partielle ne se présente pas comme une réussite.

Les statistiques partagent les mêmes validations des données brutes et des participants
persistés : un lineup incomplet ou incohérent ne produit pas de chiffres plausibles.
La page réutilise les résumés complets pour le collectif ; le JSON validé est mis en cache
avec limites de taille et de nombre, et revalidé si son contenu change.

## Configuration

Copier `.env.example` vers `.env` et renseigner `RIOT_API_KEY` avant de lancer
l'ingestion. `RIOT_PLATFORM` détermine le serveur League-V4 pour les rangs (`euw1` par
défaut; ce projet conserve des matchs EUW1). Ne jamais committer `.env` ni une clé Riot.
La base SQLite est stockée dans `./etoiles.db` par défaut (chemin configurable avec
`DATABASE_PATH`), fichier ignoré par Git.

Le schéma SQL de base est défini dans `src/lib/db/schema.ts`; les évolutions additives,
versionnées et transactionnelles sont dans `src/lib/db/migrations.ts`. Les migrations V1
à V3 ajoutent les curseurs Solo/Duo, snapshots de rang et curseurs de backfill reprenables
sans supprimer les données existantes. V3 complète aussi les colonnes de reprise des bases
déjà marquées V2 lorsque ces colonnes sont absentes.
Un snapshot par joueur, file et jour UTC est écrit lors de l'ingestion; les rangs absents
sont conservés comme « non classé », et aucun historique antérieur n'est inventé.

## Déployer sur Railway

Le dépôt est prêt à être déployé, mais aucun service, volume ou secret Railway n'a été
créé automatiquement. Le `Dockerfile` utilise Node 24, construit Astro et conserve
uniquement les dépendances de production. `tsx` en fait partie pour exécuter le
planificateur et les CLI sur le serveur ; les fichiers SQLite et `.env` sont exclus
de l'image. Le conteneur lance directement le même runtime que `npm start`, sans
wrapper npm, pour transmettre les signaux d'arrêt au serveur et au run actif.

### 1. Créer le service et son stockage

1. Créer un projet Railway et un service connecté au dépôt GitHub. Railway détecte
   le `Dockerfile` à la racine ; ne pas remplacer sa commande de démarrage.
2. Ajouter un **volume au même service** et choisir le point de montage **`/data`**.
   Ce dossier est le disque persistant, pas un répertoire du dépôt : la base y reste
   lorsque le conteneur est remplacé.
3. Définir les variables du service :

   | Variable | Valeur |
   | --- | --- |
   | `DATABASE_PATH` | `/data/etoiles.db` |
   | `INGEST_ENABLED` | `false` pour le premier déploiement |
   | `RIOT_API_KEY` | Clé valide, uniquement dans les secrets Railway |

   Railway fournit `PORT` et `RAILWAY_VOLUME_MOUNT_PATH` ; ne pas recopier les variables
   locales à l'aveugle. `HOST=0.0.0.0` est défini par l'image. Le démarrage refuse un
   service Railway sans volume ou une base située en dehors du volume.
4. Dans les réglages de déploiement, choisir **`/health`** comme healthcheck (timeout
   120 secondes), **une seule instance** et une politique de redémarrage **On Failure**.
   Ne pas définir de cron Railway séparé : il n'aurait pas accès au même volume SQLite.
5. Déployer et générer un domaine Railway. Vérifier `/health` (200), `/` et
   `/api/sync.json`. Une base encore vide est saine ; elle affiche une absence de
   synchronisation, pas une réussite inventée.

Le volume n'est disponible ni au build ni en pre-deploy : initialisation et migration
ont lieu au démarrage. Les redéploiements avec volume peuvent occasionner une brève
indisponibilité ; le healthcheck Railway n'est pas une surveillance continue.

### 2. Initialiser les joueurs et tester l'ingestion manuelle

Ouvrir un shell **dans le conteneur déployé**, avec `railway ssh` après avoir lié
le projet/service dans la CLI Railway. `railway run` exécute en local avec les variables
distantes : ce n'est pas la commande pour écrire sur le volume.

Dans ce shell, exécuter les commandes suivantes pour chacun des cinq Riot IDs :

```sh
cd /app
npm run resolvePuids -- "Pseudo#TAG"
```

Puis effectuer le backfill initial :

```sh
npm run ingest:backfill
npm run ingest:status
```

Le backfill fonctionne par lots bornés. Relancer `npm run ingest:backfill` pour les lots
suivants; `npm run ingest:status` indique si des pages ou détails restent à traiter.
Vérifier ensuite les vrais matchs sur `/` et le résultat dans `/api/sync.json`. Pour relancer
manuellement une collecte incrémentale :

```sh
npm run ingest
```

Il n'y a **pas de bouton public ni d'endpoint de synchronisation**. La CLI est réservée
aux personnes qui ont accès au service Railway. Un verrou SQLite empêche le
chevauchement manuel/planifié ; une invocation concurrente échoue explicitement.

### 3. Activer le planning après validation

Après avoir validé le déploiement **et** l'ingestion manuelle, passer
`INGEST_ENABLED=true` dans Railway et redéployer. Le démarrage vérifie une clé Riot
correctement formée, exactement cinq joueurs et au moins une ingestion réussie,
attend le healthcheck local, puis
affiche `Next ingestion: ...` dans les logs.

Le planning est **quotidien à 04:00 UTC** (05:00 en hiver, 06:00 en été à Paris),
sans appel immédiat au démarrage. Une exécution échouée est loggée et reprise au
prochain créneau ; les IDs en attente restent persistants. Après une interruption,
le serveur reprogramme le prochain 04:00 UTC : les créneaux manqués ne sont pas
rattrapés automatiquement, la CLI permet une reprise anticipée.
Le verrou est renouvelé toutes les 30 secondes et expire au bout de cinq minutes
si le processus est tué brutalement. Un arrêt propre libère le verrou.

Le footer présente la dernière réussite, les échecs et un avertissement après 48 h
sans réussite. Le statut JSON et le healthcheck sont non cachables ; une panne Riot
ne rend pas le serveur web indisponible. Surveiller ces deux aspects séparément,
ainsi que les erreurs des runs et l'expiration de la clé Riot.

### 4. Redémarrages et sauvegardes

- Redémarrer le service et vérifier que les joueurs, matchs, curseurs et dernières
  synchronisations sont encore présents, puis que le prochain créneau est loggé.
- Activer les sauvegardes du volume Railway et tester une restauration sur un service
  isolé, cron désactivé. Le volume persistant n'est pas à lui seul une sauvegarde.
- Pour transférer une base locale existante, produire un snapshot cohérent via l'API
  de backup SQLite (`better-sqlite3`), puis le téléverser sur le volume **service arrêté**.
  Ne pas copier uniquement `etoiles.db` pendant une écriture : des transactions peuvent
  encore se trouver dans `etoiles.db-wal`.
- Les assets Riot sont inclus dans le build : lancer `syncAssets` en local, vérifier
  puis versionner les assets mis à jour et reconstruire. Une écriture dans `public`
  sur le conteneur n'actualise pas les assets compilés et ne survit pas au redéploiement.

Références : [volumes Railway](https://docs.railway.com/volumes),
[healthchecks](https://docs.railway.com/deployments/healthchecks),
[Dockerfiles](https://docs.railway.com/builds/dockerfiles),
[SSH](https://docs.railway.com/cli/ssh).

## Stack

- Astro
- Tailwind CSS 4
- Rendu serveur Astro via l'adaptateur Node (compatible Railway)
- Vitest
- SQLite avec `better-sqlite3`
