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
| `/history` | Records, moments et repères collectifs par année, chronologie des soirées et archives partielles séparées |
| `/players/{puuid}` | Statistiques à cinq, champions, multikills, présences par match; courbe de rang personnelle secondaire |
| `/draft` | Table de draft à cinq sièges fixes : picks en un clic, historique et écarts de winrate à cinq, compositions jouées, bans habituels et winrates contre les champions adverses; état partageable via `?picks=` |
| `/matches/{id}` | Résultat, patch, composition, moments, objectifs et courbe d'or si la timeline est disponible |

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

Sur les icônes des picks à cinq, les flèches comparent le winrate du joueur sur ce
champion avec tous les autres picks sélectionnés à son winrate habituel sur ce même
champion à cinq. Le pick de son propre siège est remplacé pour cette comparaison.
Une flèche apparaît à partir de cinq parties communes et d'un écart d'au moins
**+5 ou −5 points de pourcentage**. L'infobulle détaille les deux bilans et l'écart ;
une association observée ne prouve pas une causalité. Sans autre pick, sans assez de
parties ou avec un écart inférieur, aucune flèche n'est affichée.

Les bans habituels restent classés par fréquence de ban, mais affichent notre winrate
**contre** ces champions, et non dans les parties où ils ont été bannis. Le second
bloc classe les adversaires par notre winrate croissant ; à taux égal, l'échantillon
le plus grand passe en premier. Les deux blocs affichent jusqu'à douze champions et
le nombre de rencontres. Le winrate est visible dès une rencontre : `ObservedWinRate`
associe un point (taux observé) à un trait (intervalle de Wilson à 95 %).
Un trait large signale une forte incertitude, sans seuil binaire de représentativité.
Un champion jamais affronté affiche « Jamais affronté », pas un taux de 0 %.
Chaque champion adverse compte une fois par partie Flex à cinq. Ces observations ne
prouvent pas l'effet d'un ban ; l'intervalle ne modélise ni les patches ni les compositions.
Cette présentation ne modifie pas les seuils des synergies et des autres écrans.
La grille des bans affiche aussi le nombre de bans, distinct de l'échantillon des rencontres.
Depuis une fiche de match, le lien de retour utilise l'historique pour retrouver la
page source et ses sélections ; sans historique utilisable, il rejoint la source
interne connue ou, à défaut, la Mémoire.

Les soirées sont regroupées par une pause de quatre heures et datées selon le fuseau
Europe/Paris. Le filtre de période utilise l'année civile; il ne prétend pas reconstituer
les saisons compétitives historiques. Le patch est extrait de la version stockée dans
chaque réponse Match-V5 et comparé dans son ordre numérique.

Les liens externes de match restent League of Graphs. Aucun identifiant OP.GG n'est
fabriqué à partir d'un Match-V5.

### Moments et découvertes

Les records et les moments ne concernent que les parties Flex à cinq archivées :
victoire éclair, partie la plus longue, éliminations collectives, séries d'au moins trois
victoires, soirées parfaites d'au moins trois matchs, pentakills et quadrakills. Les
records de durée excluent les parties de moins de dix minutes et les abandons précoces
signalés par Riot. La Mémoire recalcule les records sur l'année choisie; les fiches de
match et leurs dialogs partagent les mêmes badges. Aucun classement de joueurs n'est ajouté.

Trois types de découvertes, au maximum un de chaque :

- Premier dragon : au moins 10 matchs par groupe (notre premier dragon / celui des
  adversaires) et au moins 15 points de différence de taux de victoire. Les deux bilans
  sont affichés. Les matchs sans premier dragon attribuable sont exclus.
- Nouveau pick : au moins 5 utilisations sur les 10 dernières parties à cinq du joueur,
  aucune sur les 20 précédentes.
- Pool élargi : au moins 3 champions supplémentaires entre deux fenêtres consécutives
  de 20 parties à cinq du joueur.

Chaque découverte donne ses échantillons, sa méthode et les liens vers toutes les parties
sources. Ces seuils éditoriaux ne sont pas des tests statistiques : association n'est
pas causalité, diversité n'est pas performance, fréquence n'est pas recommandation.
Sans résultat admissible, aucun panneau de découverte n'est affiché.

La courbe de rang commence à deux dates classées, utilise les dates réelles et s'interrompt
sur les jours absents, périodes non classées et remises à zéro des compteurs victoire/défaite.
Tous les relevés restent lisibles sous le graphique. L'axe représente l'ordre des rangs
et leurs LP, jamais un MMR ni un score de comparaison entre joueurs.

## Commandes

| Commande | Action |
| --- | --- |
| `npm run dev` | Démarre Astro en développement |
| `npm run check` | Vérifie les types et composants Astro |
| `npm test` | Exécute les tests Vitest |
| `npm run build` | Construit le site de production |
| `npm start` | Démarre le serveur Node de production et le planificateur opt-in |
| `npm run preview` | Prévisualise le build |
| `npm run sync -- help` | Affiche les commandes et options de synchronisation |
| `npm run sync -- setup "Pseudo#TAG"` | Résout et enregistre les joueurs explicites, sinon ceux de `PLAYERS` |
| `npm run sync -- update` | Synchronise les nouveautés Flex, Solo/Duo et les rangs du jour |
| `npm run sync -- history [--max-duration SECONDES]` | Reprend un lot historique, ou plusieurs dans un budget explicite en secondes |
| `npm run sync -- status` | Affiche la file prête/différée, les curseurs et la prochaine action |
| `npm run syncAssets` | Télécharge les icônes de profil et de champions (Data Dragon) et génère les noms FR des champions |
| `npm run stats:benchmark` | Compare les lectures sans cache, à froid et à chaud sur des historiques synthétiques |

`sync` est l'unique CLI de données, utilisée aussi par le planificateur. Pour initialiser la base :

```sh
npm run sync -- setup "Joueur 1#EUW" "Joueur 2#EUW"
npm run sync -- history
npm run sync -- status
npm run sync -- update
```

`setup` accepte plusieurs Riot IDs explicites; sinon il lit
`PLAYERS`, séparé par des virgules. Les arguments remplacent cette variable, sans
supprimer les joueurs déjà enregistrés. Tous les IDs sont validés avant le premier
appel Riot; une liste vide, un ID mal formé ou une option inconnue échoue explicitement.
En cas d'échec réseau pendant le setup, les identités déjà résolues sont conservées et
le message précise le nombre enregistré. Le planificateur exige toujours cinq joueurs.
`status` et l'aide ne nécessitent pas de clé Riot.

Les commandes `setup`, `update` et `history` affichent un suivi horodaté limité à
une ligne de progression toutes les cinq secondes, puis le bilan et la durée totale.
Chaque lot historique est numéroté. Après 15 secondes sans nouvelle progression,
un seul rappel indique l'opération en attente, sans répétition.
Les reprises HTTP indiquent explicitement la cause (429, erreur serveur ou réseau),
le numéro de reprise et le délai avant réessai, sans modifier la politique de retry.
La clé API et les réponses brutes ne sont jamais journalisées.
`LOG_LEVEL=silent` masque ces logs informatifs, mais conserve les erreurs;
les sorties explicites de `status` et de l'aide restent affichées.

## Fiabilité de la synchronisation

L'ingestion incrémentale utilise une fenêtre initiale de 24 heures puis un chevauchement de
24 heures sur ses curseurs Flex (`ingest_cursors`) et Solo/Duo (`individual_ingest_cursors`).
Le backfill explicite possède des curseurs de page indépendants pour chaque joueur et file;
chaque page de 100 IDs et son curseur sont enregistrés ensemble dans une transaction.
Chaque exécution backfill lit au plus deux pages par joueur/file et traite au plus 100
détails de match. Relancer `npm run sync -- history` reprend à la page persistée, sans
recommencer les pages terminées. `npm run sync -- status` permet de voir les files terminées,
celles restant à parcourir et les détails encore en attente. Le backfill est fini quand les
curseurs Flex et Solo/Duo sont terminés et qu'aucun match n'attend de détail.
Les timelines à cinq doivent également être traitées (disponibles ou explicitement absentes).

`npm run sync -- history` conserve ce comportement **un seul lot par défaut**.
`npm run sync -- history --max-duration 120` répète les lots reprenables pendant un
budget de programmation de **120 secondes** (nombre positif, maximum 86400 secondes).
Le budget est vérifié entre lots et avant chaque nouvel appel Riot; l'appel déjà en
cours peut dépasser cette durée avec ses timeouts/retries HTTP existants. Ce n'est
donc pas une limite stricte de temps mural. Aucun délai ni retry supplémentaire n'est
ajouté par la CLI : elle s'arrête dès un échec (notamment 429), lorsque seuls des détails
différés restent, ou si la progression cesse. Les pages et IDs persistés sont repris
au prochain lancement; ne pas relancer en boucle pendant une pause Riot.

Le bilan distingue les imports nouveaux Flex (`440`) et Solo/Duo (`420`), les nouveaux
matchs Flex à cinq, les matchs déjà présents, les réparations et les échecs. Les réparations
sont comptées séparément des imports nouveaux. La file indique les détails prêts et
différés ainsi que la prochaine reprise connue. **Un lot réussi ne signifie pas que
l'historique est terminé** : seul le statut des deux files de chaque joueur et une file
de détails vide l'attestent. Une limite de budget ou un lot encore incomplet sans erreur
retourne 0; une erreur retourne 1 avec un message visible même avec `LOG_LEVEL=silent`.

Les IDs à traiter restent dans `ingest_pending`; chaque match et ses participants sont
écrits dans une transaction. Une erreur laisse l'ID en file, enregistre son nombre de
tentatives et applique un délai progressif avant réessai. Les délais Riot trop longs
respectent aussi un backoff renforcé. Les échecs restent visibles dans les logs et un run
comportant des erreurs est enregistré `failed`; une interruption ne détruit ni les IDs ni
les curseurs déjà persistés.
Les anciens matchs dont les participants sont incomplets sont aussi remis en file :
une réparation échouée conserve les données existantes et l'ID à reprendre.

### Timelines compactes

Après les détails et les rangs, un lot sans erreur collecte au plus **10 timelines**
de matchs Flex à cinq. Aucun appel n'est effectué depuis une page web. La file
`match_timelines` se remplit à la première synchronisation compatible et se reprend par les
mêmes commandes `sync update` / `sync history`; `history --max-duration` traite plusieurs
lots dans son budget existant. `sync status` affiche aussi disponibles, absentes, prêtes,
différées et prochaine reprise des timelines.

Seuls l'écart d'or des dix participants à chaque relevé, les événements de dragons,
barons, hérauts, larves, tours et inhibiteurs et les éliminations (heure, champions
tueur/victime, équipe) sont conservés. Une élimination par l'environnement reste
sans champion tueur ni équipe attribuée. Le match et les dix PUUIDs
sont vérifiés avant extraction; les équipes sont résolues par identité, pas par l'ordre
du tableau. Le JSON brut de timeline, les positions et les inventaires ne sont pas stockés.
Un objectif dont l'auteur est inconnu reste non attribué.
Les anciens résumés v1 restent lisibles et sont actualisés progressivement vers la v2
par les mêmes lots de synchronisation, avec les mêmes limites et reprises sur erreur.
Ils comptent à la fois comme disponibles et en attente d'actualisation dans `sync status`;
aucun appel Riot n'est déclenché par la consultation du graphique.
Si Riot ne fournit plus la timeline à l'actualisation, les anciens objectifs et relevés
restent disponibles; les kills sont signalés indisponibles et la mise à jour n'est plus retentée.

Un HTTP 404 marque une timeline absente chez Riot sans fabriquer un graphique.
Les autres erreurs restent visibles dans les logs, font échouer le lot et sont différées
avec backoff exponentiel (une minute à six heures; base quinze minutes sur 429).
Un `Retry-After` plus long reste prioritaire, même au-delà de six heures.
Un 429 arrête immédiatement les appels de timeline du lot. Les requêtes réutilisent
timeouts/retries et `Retry-After` du client Riot. Un lot déjà en cours peut dépasser
le budget de programmation, comme pour les détails.

La page de match et le dialog montrent un graphique à axes gradués de l'écart d'or
depuis le point de vue des Étoiles : or au-dessus de zéro, bleu en dessous. Les objectifs
et portraits des tueurs sont sur une seule ligne. Les événements proches sont regroupés
en fenêtres temporelles adaptées à la largeur disponible, avec un compteur. Les bulles
au survol, au focus ou au toucher détaillent tous les événements avec icônes d'objectifs,
portraits tueur/victime, horaires exacts et couleurs d'équipe; les longues bulles sont
défilables. Un marqueur bicolore regroupe les
deux équipes. Des filtres séparent objectifs et kills et recalculent les agrégats.
Survoler le graphique explore les relevés,
cliquer en fixe un; un curseur natif permet aussi la navigation tactile et au clavier.
Cliquer sur un marqueur fixe le relevé d'or observé le plus proche du début du groupe,
sans inventer une valeur d'or à l'instant de l'événement. Sur mobile, la frise défile
horizontalement. Il n'y a pas de version textuelle ni de panneau de détail séparé :
les événements se consultent dans les bulles. Les éliminations absentes d'un résumé v1 sont signalées, pas
présentées comme un total nul. Une victoire avec au moins
5 000 or de retard observé devient un moment de retournement. C'est un maximum parmi
les relevés Riot (généralement à la minute), pas une mesure continue ni une reconstitution.
La Mémoire précise la couverture des timelines et des champs de multikill.

Le client HTTP utilise un timeout de 30 secondes pour les appels Riot de collecte et de
rangs, et au plus trois retries pour les erreurs réseau, 429 et 5xx. Pour les appels Riot, il
respecte `Retry-After` jusqu'à cinq minutes par attente ; un backfill peut donc prendre
du temps. Si cette limite ou le nombre de
retries est dépassé sur un 429, le run s'arrête en échec sans multiplier les appels :
les IDs et pages déjà collectés restent persistés. Relancer `npm run sync -- history`
après la pause indiquée par `npm run sync -- status` reprend la collecte. La clé Riot et les IDs sont
validés avant les appels. Les assets sont vérifiés avant écriture (réponse HTTP et
signature PNG), remplacés atomiquement, et une
synchronisation partielle ne se présente pas comme une réussite.
Les erreurs Riot affichent le statut et le chemin de l'appel; si la réponse inclut un
JSON structuré, son message est ajouté comme indice. Ce détail peut être absent ou changer
côté Riot : le statut HTTP reste la référence du traitement.

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
versionnées et transactionnelles sont dans `src/lib/db/migrations.ts`, seul chemin de
création et d'évolution de la base. `schema.ts` conserve le socle historique, appliqué par
la première migration ; `open.ts` configure SQLite sans modifier le schéma à part.
Les migrations V1 à V3 ajoutent les curseurs Solo/Duo, snapshots de rang et curseurs de backfill reprenables
sans supprimer les données existantes. V3 complète aussi les colonnes de reprise des bases
déjà marquées V2 lorsque ces colonnes sont absentes.
Un snapshot par joueur, file et jour UTC est écrit lors de l'ingestion; les rangs absents
sont conservés comme « non classé », et aucun historique antérieur n'est inventé.

V4 centralise la mise à niveau de `ingest_runs.finished_at`. V5 ajoute `data_revision` :
les modifications effectives des joueurs, matchs, participants et snapshots de rang
incrémentent sa version par triggers, dans la transaction d'écriture. Les verrous,
curseurs, IDs en attente et résultats de runs ne l'incrémentent pas. Une ingestion
partiellement échouée invalide donc bien les statistiques si elle a importé des données.

V6 ajoute la file et les résumés compacts `match_timelines`. Seuls les changements de statut,
de résumé, les insertions et suppressions incrémentent la révision; le backoff seul ne
périme pas les statistiques. Une réparation de match retire son ancien résumé pour le
recollecter. Aucune ligne historique de match, participant ou rang n'est modifiée par V6.

Pour faire évoluer le schéma : ajouter une migration avec le prochain numéro, mettre à
jour `SCHEMA_VERSION`, puis tester une base neuve et les anciennes versions concernées.
Ne pas réécrire une migration déjà utilisée ni ajouter de réparation dans `open.ts`.
Si une nouvelle table ou colonne influence les statistiques, adapter aussi les triggers
de révision dans cette nouvelle migration. Une base plus récente que le code est refusée
avant toute modification ; une migration échouée est annulée sans avancer sa version.

### Lectures et cache des statistiques

SQLite et les réponses Riot restent la source de vérité. Les profils, résumés de matchs,
bans, bilan collectif non filtré, soirées et historique de draft sont calculés à la demande
et mis en cache en mémoire, par connexion et version des données. Chaque lecture vérifie
la version dans une transaction de lecture cohérente : une CLI distincte du serveur est
donc détectée à la consultation suivante, sans délai d'expiration arbitraire.

Le cache conserve au plus 16 entrées et 16 millions de caractères JSON (16 Mi caractères,
soit au plus environ 32 MiB de contenu UTF-16, hors surcoûts du runtime). Les entrées les
moins récemment utilisées sont évincées ; un résultat trop grand est calculé sans être
retenu. Chaque appel reçoit sa propre copie mutable. Le parsing/validation du JSON Riot
est partagé entre parcours collectifs et individuels, avec ses limites préexistantes.
Les filtres restent calculés sur les résultats partagés, sans cache par combinaison.
Le statut de synchronisation et le healthcheck ne sont jamais mis dans ce cache.

Les caches sont jetables : un redémarrage ou un déploiement reconstruit les résultats à
la première consultation. Aucune lecture issue d'une transaction d'écriture externe
susceptible d'être annulée n'est publiée dans le cache.

`npm run stats:benchmark` compare les parcours de données accueil, profil, mémoire et
draft sur des fixtures classées de 100, 1 000 et 5 000 matchs (Solo/Duo, Flex à cinq,
Flex partiel, patches, champions et rangs), moments et découvertes inclus.
Des tailles explicites sont possibles :
`npm run stats:benchmark -- 1000 5000`. La commande vérifie l'identité des résultats,
la limite de payload et un gain à chaud d'au moins 2 fois à partir de 1 000 matchs.
Elle mesure la couche données, pas le rendu HTML ni la latence HTTP ; les temps absolus
dépendent de la machine.

Mesure locale du 9 novembre 2026 sur 1 000 matchs synthétiques (médianes, en ms) :

| Parcours | Sans cache | Cache chaud |
| --- | ---: | ---: |
| Accueil | 305,7 | 5,0 |
| Profil | 198,1 | 0,6 |
| Mémoire | 139,4 | 4,1 |
| Draft | 184,8 | 1,5 |

Les routes du build ont aussi été vérifiées en HTTP sur une base synthétique séparée :
réponses identiques à chaud, filtres conservés et renommage externe visible sans
redémarrage. Ces chiffres ne constituent pas une promesse de latence en production.

Pas de vues matérialisées, Redis, ORM ni schéma en étoile à ce stade. Le précalcul
persistant ne devient utile que si les mesures en production montrent que la première
consultation ou la reconstruction après synchronisation pénalise réellement l'usage.

### Images Riot

Les portraits de champions et emblèmes de rang sont intégrés au build dans `_astro/riot/`
avec une empreinte SHA-256 et peuvent être mis en cache durablement par le navigateur.
Les avatars de joueurs sont servis par `/api/profile-icons/{puuid}.png` : la route ne
répond que pour les joueurs enregistrés, télécharge l'icône depuis Riot et Data Dragon
à la demande, puis la met en cache sur le volume persistant à côté de la base SQLite.
`syncAssets` peut préremplir ce même cache; aucun redémarrage ni rebuild n'est requis
pour les nouveaux avatars. Le navigateur conserve la réponse une heure; le serveur
rafraîchit son cache après 24 heures et sert une ancienne image si l'amont est
temporairement indisponible.

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

Dans ce shell, enregistrer les cinq Riot IDs explicitement (ou utiliser les cinq
valeurs de `PLAYERS` avec `npm run sync -- setup`) :

```sh
cd /app
npm run sync -- setup "Joueur 1#EUW" "Joueur 2#EUW" "Joueur 3#EUW" "Joueur 4#EUW" "Joueur 5#EUW"
```

Puis effectuer le backfill initial :

```sh
npm run sync -- history --max-duration 120
npm run sync -- status
```

Le backfill fonctionne par lots bornés, repris dans le budget de programmation indiqué
(secondes; un appel HTTP en cours peut le dépasser). Relancer `npm run sync -- history`
pour un seul lot suivant, ou avec un nouveau budget; `npm run sync -- status` indique
si des pages ou détails restent à traiter et quand reprendre les détails différés.
Vérifier ensuite les vrais matchs sur `/` et le résultat dans `/api/sync.json`. Pour relancer
manuellement une collecte incrémentale :

```sh
npm run sync -- update
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
- Les icônes de champions et emblèmes de rang sont intégrés au build : lancer `syncAssets`
  en local, vérifier puis versionner les changements dans `public` et les noms français
  avant de reconstruire. Les avatars de profil sont mis en cache sur le volume Railway
  et servis à la demande; `syncAssets` sur le serveur peut préremplir ce cache.

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
