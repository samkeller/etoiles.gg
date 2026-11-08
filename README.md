# etoiles.gg

Dashboard analytique des **Étoiles de l'Esport**, une équipe de cinq en classé flexible.
Les statistiques d'équipe ne comptent que les parties disputées avec les cinq joueurs.

## Démarrer en local

Prérequis : Node.js `>=22.23.4`.

```sh
npm ci
npm run dev
```

Le site est servi sur <http://localhost:4321>. La page d'accueil, calculée côté serveur
depuis SQLite, présente :

- le bilan des matchs joués à cinq : taux de victoire, forme des 20 derniers matchs, série
  en cours et meilleure série ;
- une fiche par joueur : rôle, champions signatures, KDA, participation aux kills, part des
  dégâts, CS ou vision par minute, courbe d'implication et meilleure partie ;
- le collectif : associations joueur/champion et compositions à cinq ;
- l'historique des matchs à cinq, avec le détail de chaque match dans une fenêtre, et à
  part les matchs partiels (2 à 4 joueurs), qui ne comptent dans aucune statistique.
  Les listes repliées sont chargées à l'ouverture ; sans JavaScript, leurs liens GET
  permettent de les consulter (`?history=all` et `?partial=show`).

Le nom du site est centralisé dans `src/lib/site.ts` (`SITE_NAME`, actuellement
`etoiles.gg`), séparément du nom de l'équipe (`TEAM_NAME`). Le menu opaque reste visible
sur toute la largeur de l'écran lors du défilement ; le fond fixe couvre l'écran.
La forme récente et les meilleures parties ouvrent le même détail de match.
Ce détail inclut les sorts d'invocateur ; il réutilise les fragments déjà chargés pendant
la session (maximum 40), annule les requêtes obsolètes, remet le scroll en haut et
propose « Réessayer » en cas d'échec.

Les données sont aussi exposées en JSON (GET) :

| Route | Contenu |
| --- | --- |
| `/api/matches.json?scope=full\|partial` | Liste des matchs (`full` par défaut) |
| `/api/matches/{id}.json` | Détail d'un match (400 si l'id est invalide, 404 s'il est inconnu) |
| `/api/players.json` | Fiches des cinq joueurs |
| `/api/sync.json` | Dernière tentative/réussite, état, file d'attente et planning |
| `/health` | Disponibilité du serveur et de SQLite en lecture/écriture (200 ou 503) |

Le style passe par Tailwind ; les tokens de la charte (couleurs, polices, animations)
sont définis dans `src/styles/global.css` et les composants réutilisables dans
`src/components/ui/`. Les agrégations sont dans `src/lib/stats/`.

## Lire les observations de draft

Seules les associations et compositions jouées **au moins 5 fois à cinq** affichent un bilan,
par taux de victoire décroissant, puis par nombre de matchs en cas d'égalité,
avec nombre de matchs et bilan V/D. Le trait
clair sur les barres indique le taux de victoire global de l'équipe.
À **4/5 matchs**, une zone repliée « Encore un match » montre uniquement l'association
et son volume : aucun winrate, bilan V/D ou indicateur de performance n'est publié.
Les essais à moins de quatre matchs restent masqués.

Une association identifie deux joueurs avec leurs champions ; une composition complète
identifie les cinq joueurs, champions et rôles. Les duos de joueurs seuls ne sont pas
comparés : les cinq étant toujours présents, ils auraient tous le même bilan.
Les petits échantillons et les associations qui se recoupent ne prouvent pas une synergie
et ne constituent pas une recommandation de draft. Sans cinq matchs pour une composition,
un état explicite est affiché.

Les synergies peuvent être filtrées sur un rôle (tous les duos qui le contiennent) ou
deux rôles (ce duo précis). Le bilan et le seuil de 5 matchs sont recalculés sur les
parties réellement jouées à ces rôles, pas sur le rôle principal ou le dernier rôle du
joueur. Ce filtre ne modifie pas les compositions complètes ni le bilan global.
Le formulaire fonctionne sans JavaScript et conserve la sélection dans l'URL
(`?role=JUNGLE&role2=UTILITY#collective-title`) ; « Réinitialiser » retrouve tous les duos.
Les sélecteurs utilisent la primitive Tailwind `RoleSelect` : cadre Hextech et icône Riot
du rôle sélectionné, mise à jour par CSS sans JavaScript. Le contrôle natif conserve
sa navigation clavier et sa liste système sur mobile.

Les séries de l'aperçu ne portent que sur les matchs à cinq : les résultats partiels ne
les interrompent pas. Le dernier match de chaque observation ouvre le détail existant.
Les frises mensuelles et séries collectives retirées de l'interface ne sont plus calculées.

Le lien externe reste League of Graphs : le lien de détail OP.GG proposé utilise un
identifiant opaque non disponible dans Match-V5. Ce changement reste explicitement
bloqué dans `TODO.md`, plutôt que de fournir un lien incorrect.

## Commandes

| Commande | Action |
| --- | --- |
| `npm run dev` | Démarre Astro en développement |
| `npm run check` | Vérifie les types et composants Astro |
| `npm test` | Exécute les tests Vitest |
| `npm run build` | Construit le site de production |
| `npm start` | Démarre le serveur Node de production et le planificateur opt-in |
| `npm run preview` | Prévisualise le build |
| `npm run ingest` | Lance l'ingestion des matchs flex pour les PUUIDs configurés |
| `npm run ingest -- --backfill` | Lance l'ingestion complète (sans date de début) des matchs flex pour les PUUIDs configurés |
| `npm run resolvePuids -- "Pseudo#TAG"` | Résout le PUUID d'un joueur via son Riot ID et l'enregistre en base |
| `npm run syncAssets` | Télécharge les icônes de profil et de champions (Data Dragon) et génère les noms FR des champions |

## Fiabilité de la synchronisation

L'ingestion pagine les listes Riot par tranches de 100 IDs, y compris en incrémental.
Les IDs à traiter sont conservés dans `ingest_pending`. Un curseur par joueur
(`ingest_cursors`) avec chevauchement de 24 heures couvre les matchs encore en cours
ou indexés tardivement ; un échec de collecte n'avance pas le curseur.
Chaque match et ses participants sont écrits dans une transaction.
Les anciens matchs dont les participants sont incomplets sont aussi remis en file :
une réparation échouée conserve les données existantes et l'ID à reprendre.
Les échecs restent repris au prochain run ; un run comportant des erreurs est enregistré
`failed` et la CLI quitte avec un code non nul.

Le client HTTP utilise un timeout de 10 secondes et au plus trois retries pour les erreurs
réseau, 429 et 5xx. Pour les appels Riot de collecte et de résolution des joueurs, il
respecte `Retry-After` jusqu'à cinq minutes par attente ; un backfill peut donc prendre
du temps. Si cette limite ou le nombre de
retries est dépassé sur un 429, le run s'arrête en échec sans multiplier les appels :
les IDs déjà collectés restent en attente et les curseurs des collectes inachevées ne
sont pas avancés. Relancer `npm run ingest -- --backfill` une fois la limite Riot
expirée pour reprendre aussi les collectes inachevées. La clé Riot et les IDs sont
validés avant les appels. Les assets sont vérifiés avant écriture (réponse HTTP et
signature PNG), remplacés atomiquement, et une
synchronisation partielle ne se présente pas comme une réussite.

Les statistiques partagent les mêmes validations des données brutes et des participants
persistés : un lineup incomplet ou incohérent ne produit pas de chiffres plausibles.
La page réutilise les résumés complets pour le collectif ; le JSON validé est mis en cache
avec limites de taille et de nombre, et revalidé si son contenu change.

## Configuration

Copier `.env.example` vers `.env` et renseigner `RIOT_API_KEY` avant de lancer
l'ingestion. Ne jamais committer `.env` ni une clé Riot. La base SQLite est stockée
dans `./etoiles.db` par défaut (chemin configurable avec `DATABASE_PATH`), fichier ignoré
par Git.

Le schéma SQL est défini une seule fois dans `src/lib/db/schema.ts`, partagé par l'app,
les scripts et les fixtures. Il est inclus dans le bundle de production et ne dépend
pas d'un fichier SQL à côté des chunks compilés.

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
npm run ingest -- --backfill
```

Vérifier les logs, un code de sortie nul, les vrais matchs sur `/` et une réussite
dans `/api/sync.json`. Pour relancer manuellement une collecte incrémentale :

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
