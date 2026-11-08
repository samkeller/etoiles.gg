# etoiles.gg — Roadmap macro fonctionnelle & technique

Document de référence pour le projet. Il distingue l'existant vérifié des décisions et
fonctionnalités encore à réaliser ; les éléments futurs ne doivent pas être anticipés par
du code inutilisé.

## 0. Contexte et état du projet

### Produit

Dashboard de statistiques pour une équipe de cinq joueurs de League of Legends en classé
flexible. Priorités :

1. Encourager l'équipe avec un affichage soigné.
2. Suivre la progression individuelle dans le cadre collectif.
3. Raconter les matchs, les synergies et aider à la draft.

Les statistiques d'équipe ne comptent que les matchs où les cinq joueurs sont présents
(`lineup_size = 5`). Les matchs partiels doivent rester distincts et ne jamais contaminer
les chiffres de l'équipe. Aucune fonctionnalité ne doit classer ou humilier les joueurs ;
un MVP de match est une récompense, pas un jugement.

### État vérifié au 8 novembre 2026

- **Interface :** la route `/` affiche en rendu serveur, sur une page unique ancrée
  (Équipe, Joueurs, Collectif, Historique) :
  - le panneau d'équipe : jauge du taux de victoire, forme des 20 derniers matchs à cinq,
    série en cours et indicateurs ;
  - les fiches des cinq joueurs : rôle principal, trois champions signatures avec leur taux
    de victoire, KDA, participation aux kills, part des dégâts, CS/min (vision/min pour le
    support), courbe d'implication (moyenne glissante sur 5 matchs) et meilleure partie ;
  - le récit collectif : trois plus longues séries de victoires avec résultats cliquables ;
    associations joueur/champion et compositions
    rejouées au moins 5 fois, triées par taux de victoire décroissant avec bilan global
    comme repère et filtre des synergies sur un ou deux rôles ;
  - l'historique des matchs à cinq (10 visibles, les autres repliés) et, dans une zone
    distincte repliée, les matchs partiels de 2 à 4 Étoiles. Les parties à un seul joueur
    ne sont pas des matchs d'équipe et ne sont pas affichées.
  Un clic sur un match (ou sur une « meilleure partie ») ouvre un `<dialog>` natif dont le
  contenu est un fragment HTML rendu par le serveur (`/partials/matches/{id}`) : les deux
  équipes, leurs objectifs, la feuille de chaque joueur et un lien League of Graphs
  (`rel="noopener noreferrer"`). Le seul JavaScript client est ce petit script du dialog.
- **API :** GET `/api/matches.json?scope=full|partial`, `/api/matches/{id}.json` (400 si
  l'identifiant est invalide, 404 s'il est inconnu) et `/api/players.json`.
- **Design system :** Tailwind CSS 4 ; les tokens (palette Hextech, polices Beaufort et
  Spiegel, ombres, animations) et les utilitaires (`label-caps`, `text-gold-gradient`,
  `focus-ring`) sont définis dans `src/styles/global.css`. Les primitives réutilisables
  sont dans `src/components/ui/` (`Panel`, `RingGauge`, `FormStrip`, `Metric`,
  `SectionHeading`, `Disclosure`, `ChampionIcon`, `RoleIcon`, `Avatar`, `MeterBar`,
  `Sparkline`, `StatRow`, `MatchTrail`, `WinRateComparison`, `RoleSelect`), les composants métier dans
  `src/components/matches/`, `src/components/players/` et `src/components/collective/`,
  et les assemblages de page dans `src/components/sections/`.
- **Serveur :** Astro 7 en rendu serveur avec adaptateur Node autonome ; Node.js
  `>=22.23.4`.
- **Ingestion :** `resolvePuids.ts` enregistre un Riot ID dans le roster SQLite ;
  `ingest.ts` récupère les matchs flex (`queue_id = 440`) et leur `raw_json` (le tag Riot
  est lu depuis `riotIdTagline`). `syncAssets.ts` télécharge depuis Data Dragon les icônes
  de profil et de tous les champions présents dans les matchs (alliés et adversaires), et
  génère leurs noms français dans `src/lib/lol/champion-names.json`.
- **Base locale observée :** 5 joueurs, 190 matchs : 58 à cinq, 10 à quatre, 3 à trois,
  80 à deux et 39 à un joueur. Le dernier run enregistré a réussi sans nouveau match.
  Ces volumes sont un instantané local, pas des constantes produit.
- **Schéma :** tables `players`, `matches`, `participants` et `ingest_runs`, définies dans
  `src/lib/db/schema.sql`. La base est `./etoiles.db` par défaut, surchargeable par
  `DATABASE_PATH`, et ignorée par Git.
- **Tests :** Vitest teste `getOverview()`, `getMatches()`, `getMatchDetail()`,
  `getPlayers()` et `getCollective()` sur SQLite en mémoire, avec des fixtures partagées
  (`src/lib/stats/fixtures.ts`) : absence de matchs, exclusion des lineups partiels, séries,
  forme, détail d'un match, identifiants invalides, enregistrements incomplets, seuil exact
  de 5 matchs, identité joueur/champion/rôle et séries maximales.
- **Validation du lot 3 :** 25 tests passent ; check sans erreur (un hint préexistant
  d'import inutilisé dans `PlayerCard`), build réussi. Rendu desktop/mobile et ouverture
  du dialog au clic et au clavier vérifiés ; états vide et composition qualifiée vérifiés
  sur un serveur de production avec SQLite isolée.
- **Pas encore livré :** cron, hébergement Railway configuré ou healthcheck.

**Limite connue de l'ingestion :** un run demande au plus 100 IDs de match par joueur.
`--backfill` omet `startTime`, mais ne pagine pas au-delà de cette première page ; plusieurs
exécutions peuvent compléter les données, sans garantie de backfill exhaustif.

### Stack actuelle et choix futurs

Stack actuelle : Astro, adaptateur Node, TypeScript, Tailwind CSS 4, `better-sqlite3`,
`tsx`, dotenv et Vitest. Les requêtes SQLite sont écrites en SQL brut ; aucun ORM n'est
utilisé. `RIOT_API_KEY` est fourni par l'environnement pour l'accès à l'API Riot.

Pour la suite de l'interface : Astro pour le rendu serveur, Tailwind et les tokens de
`global.css` pour tout le style (pas de feuilles de style par composant), Preact seulement
pour les interactions réellement nécessaires, et graphiques SVG maison plutôt qu'une
bibliothèque de graphes. Preact reste installé mais n'est pas intégré ; ne l'activer que
lors d'un lot qui en a besoin. L'hébergement Railway et le volume `/data` restent des
objectifs à confirmer, pas un déploiement existant.

## 1. Contrats produit et techniques

1. Les agrégations et requêtes appartiennent à `src/lib/stats/` (un module par domaine,
   réexportés par `index.ts`) ; les routes API sérialisent les résultats ; les composants ne
   contiennent pas de logique métier.
2. Toute statistique « équipe » filtre `lineup_size = 5`. Les lineups partiels ont un
   affichage distinct, masqué par défaut.
3. Endpoints futurs : GET uniquement, paramètres validés, réponses agrégées et réponses vides
   explicites si aucune donnée n'est disponible.
4. Tester les fonctions d'agrégation avant de les exposer : cas nominal, aucun résultat et
   lineup partiel. Utiliser des fixtures anonymisées.
5. Ne jamais committer de secret ni de base locale, ni journaliser `RIOT_API_KEY`.
6. Accessibilité : contraste AA, focus visible, libellés accessibles et respect de
   `prefers-reduced-motion`.
7. Ajouter de nouvelles colonnes SQLite seulement si les performances l'exigent ; les champs
   détaillés sont déjà conservés dans `raw_json`.
8. La page expose uniquement les lots livrés (0 à 3). Pas de placeholders, composants ou
   dépendances anticipant des lots futurs.

## 2. Décisions UX et visuelles pour la future interface

- Commencer par une page narrative unique `/`. Les détails de match, joueur et synergies
  s'ouvrent en dialog tant qu'ils ne nécessitent pas d'URL partageable.
- N'ajouter des routes dédiées que si un détail devient une destination consultée ou
  partageable. Pas de navigation à onglets avant d'avoir constaté un besoin réel.
- Pas de bibliothèque de graphiques : SVG maison, adapté aux petits volumes et au style
  visuel du site. N'ajouter une bibliothèque d'animation qu'en cas de besoin démontré.
- Toute couleur, police, ombre ou animation est un token `@theme` de
  `src/styles/global.css` avant d'être utilisée ; aucune valeur en dur dans les composants.
  Identité Hextech (bleu nuit, or, Beaufort/Spiegel) et assets Riot de `/public/riot`.
  L'or signifie uniquement une victoire ou un élément positif ; les défaites restent
  neutres/désaturées.
- Chaque bloc de données est une visualisation (jauge, frise, courbe…) encadrée par
  `Panel`, pas une simple carte de chiffres ; ajouter une primitive à `components/ui`
  dès qu'un motif visuel est réutilisé.
- Éviter les classements négatifs entre coéquipiers. Les insights individuels sont formulés
  de manière positive ou neutre.

## 3. Lots à réaliser

### LOT 0 — Reprise de l'interface et fondations

**État : terminé le 7 novembre 2026.**

- Design system Tailwind initié : tokens `@theme`, utilitaires `label-caps` et
  `text-gold-gradient`, polices et icônes Riot, primitives `Panel`, `RingGauge`,
  `FormStrip` et `Metric`.
- `getOverview()` agrège les matchs depuis SQLite (bilan, série en cours, meilleure série,
  forme des 20 derniers matchs) ; un lineup prétendument complet mais incomplet ou
  incohérent provoque une erreur explicite.
- La section `TeamOverview` est rendue côté serveur dans `/`, sans fetch ni JavaScript
  client ; les animations respectent `prefers-reduced-motion`.
- Retrait du fond d'étoiles Preact non utilisé ; aucun îlot décoratif n'est chargé.

**Validé :** les chiffres affichés proviennent de la base, excluent les lineups partiels,
sont testés sur SQLite en mémoire, et la page s'adapte aux petits écrans.

### LOT 1 — Historique des matchs

**État : terminé le 7 novembre 2026.**

- `getMatches(db, 'full' | 'partial')` et `getMatchDetail(db, id)` dans
  `src/lib/stats/matches.ts`, exposés par `/api/matches.json?scope=` et
  `/api/matches/{id}.json`.
- Section `MatchHistory` : 10 derniers matchs à cinq, les précédents repliés ; matchs
  partiels (2 à 4 Étoiles) dans une zone distincte, repliée et explicitement exclue des
  statistiques.
- Détail en `<dialog>` chargé depuis un fragment serveur, avec lien League of Graphs
  `rel="noopener noreferrer"`.

**Validé :** chaque match est consultable (API 200/400/404 vérifiées) et les matchs
partiels n'affectent aucun indicateur d'équipe.

### LOT 2 — Joueurs et progression

**État : terminé le 7 novembre 2026.**

- `getPlayers(db)` dans `src/lib/stats/players.ts`, exposé par `/api/players.json`, calcule
  sur les seuls matchs à cinq : rôles, pool de champions, moyennes, participation aux kills,
  part des dégâts, CS et vision par minute, progression et meilleure partie.
- Section `TeamRoster` : cinq fiches de même structure, ordonnées par rôle et jamais
  classées entre elles ; la tendance récente n'est soulignée (en or) que lorsqu'elle est
  positive. Pas de drill-down joueur : la meilleure partie ouvre le détail du match.

**Validé :** fiches testées et vérifiées sur la base réelle ; insights neutres ou positifs.

### LOT 3 — Récit collectif et synergies

**État : terminé le 8 novembre 2026.**

- `getCollective(db)` réutilise les matchs complets et leur validation dans `getMatches`.
  Chaque résultat des séries ouvre le dialog existant. Les trois séries maximales de victoires les
  plus longues sont affichées, départagées par récence, y compris une série en cours.
- Les associations portent sur deux joueurs et leurs champions : les duos de joueurs seuls
  auraient tous le même bilan puisque les cinq joueurs sont toujours présents. Les
  compositions exactes tiennent aussi compte des rôles. Les alias Data Dragon sont normalisés.
- Seuil validé : **5 matchs minimum** par association ou composition. Tri par taux de
  victoire décroissant, puis nombre de matchs en cas d'égalité ; quatre observations visibles puis les autres
  repliées. Volumes, victoires/défaites et repère du bilan global sont visibles. Le texte
  précise que ces petits échantillons qui se recoupent ne prouvent aucune synergie ni causalité.
- Sur la base actuelle : 9 associations qualifiées, aucune composition exacte à 5 matchs.
  L'état insuffisant est explicite ; aucun résultat fictif n'est substitué.
- Le rendu serveur suffit : aucun nouvel endpoint ou îlot client. Primitives `MatchTrail`
  et `WinRateComparison`, composants métier `DraftRow` et `DraftObservations`, section
  `TeamCollective` et ancre « Collectif ».
- Ajustement UX : suppression du titre introductif « Le fil de l'équipe / Ce qu'on
  construit ensemble » et de la frise « Au fil des mois », y compris son agrégation
  mensuelle inutilisée ; les séries sont conservées dans un encart compact.
  Filtre GET des synergies
  (`role`, `role2`) : un rôle présent dans le duo, ou deux rôles pour le duo précis.
  L'agrégation et le seuil s'appliquent aux rôles réellement joués dans chaque match ;
  les autres données collectives ne sont pas filtrées. Rôles invalides : réponse 400.
- Sélecteurs natifs stylisés via la primitive Tailwind `RoleSelect`, avec icône de rôle
  Riot actualisée par CSS, focus visible et navigation clavier native ; aucun script ajouté.

**Validé :** exclusion des matchs partiels, seuils 4/5, regroupement et tri, cas vides,
séries en cours testées ; intégration dialog, clavier
et rendu mobile vérifiés.

### LOT 4 — Exploitation et déploiement

- Ajouter une synchronisation planifiée seulement après validation du déploiement et du
  fonctionnement de l'ingestion.
- Ajouter healthcheck, statut de synchronisation, métadonnées et documentation de démarrage.
- Vérifier le stockage persistant, les variables d'environnement, les logs et le comportement
  mobile/accessibilité avant mise en production.

**Terminé quand :** un déploiement documenté peut se synchroniser sans intervention manuelle
et survivre à un redémarrage du serveur.

### LOT 5 — Réserve, décision explicite requise

- Navigation à onglets, routes partageables de joueurs ou matchs.
- Heatmap calendaire, records individuels, match du mois.
- Données de timeline détaillées d'un match.
- Page dédiée aux matchs partiels.

## 4. Ordre macro indicatif

| Lot | Livrable |
|---|---|
| 0 | Première interface réelle et aperçu d'équipe vérifié |
| 1 | Historique consultable, matchs partiels isolés |
| 2 | Fiches des cinq joueurs et progression |
| 3 | Récit collectif et synergies fiables |
| 4 | Synchronisation et déploiement opérationnels |
| 5 | Options retenues après usage réel |

L'ordre privilégie la confiance dans les données, puis l'adhésion des joueurs, la lecture
collective et enfin l'exploitation autonome. Les durées de l'ancienne estimation sont à
recalculer après le lot 0.

## 5. Rappel pour les contributions

- Distinguer l'état vérifié des intentions ; mettre ce document à jour après chaque lot.
- Ne pas coder à l'avance les fonctionnalités des lots suivants.
- Tester chaque agrégation avec un lineup partiel pour garantir son exclusion.
- Ne jamais afficher une donnée de démonstration comme une donnée réelle.
- On préfèrera des interfaces modernes, jolies et avec un UX soigné. Cette application est juste une application de présentations de statistiques d'équipe, la présentation est primordiale.
- Le plus possible utiliser tailwind plutôt que du CSS natif pour maintenir la cohérence et faciliter la maintenance.
- Si un pattern de style (taille de texte, marge etc) est utilisé, le réutiliser plutôt que de créer un nouveau -> création d'une charte graphique et d'un design system unifié et cohérent.
- Ne pas trop se casser la tête avec un affichage mobiel parfait.