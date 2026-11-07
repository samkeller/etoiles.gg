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

### État vérifié au 7 novembre 2026

- **Interface :** la route `/` affiche en rendu serveur le panneau d'équipe : jauge
  circulaire du taux de victoire (victoires et défaites), forme des 20 derniers matchs à
  cinq avec la série en cours, et indicateurs (matchs à cinq, meilleure série, date du
  premier match). Aucun JavaScript client, îlot interactif ou endpoint API n'est nécessaire.
- **Design system :** Tailwind CSS 4 ; les tokens (palette Hextech, polices Beaufort et
  Spiegel, ombres, animations) sont définis dans `src/styles/global.css` via `@theme`. Les
  primitives réutilisables sont dans `src/components/ui/` (`Panel`, `RingGauge`,
  `FormStrip`, `Metric`) et les assemblages de page dans `src/components/sections/`.
- **Serveur :** Astro 7 en rendu serveur avec adaptateur Node autonome ; Node.js
  `>=22.23.4`.
- **Ingestion :** `resolvePuids.ts` enregistre un Riot ID dans le roster SQLite ;
  `ingest.ts` récupère les matchs flex (`queue_id = 440`) et leur `raw_json`.
- **Base locale observée :** 5 joueurs, 190 matchs : 58 à cinq, 10 à quatre, 3 à trois,
  80 à deux et 39 à un joueur. Le dernier run enregistré a réussi sans nouveau match.
  Ces volumes sont un instantané local, pas des constantes produit.
- **Schéma :** tables `players`, `matches`, `participants` et `ingest_runs`, définies dans
  `src/lib/db/schema.sql`. La base est `./etoiles.db` par défaut, surchargeable par
  `DATABASE_PATH`, et ignorée par Git.
- **Tests :** Vitest teste `getOverview()` avec SQLite en mémoire : absence de matchs,
  exclusion des lineups partiels, série en cours, meilleure série, forme récente et
  enregistrements incomplets.
- **Pas encore livré :** historique, fiches joueurs, synergies, endpoints, cron, hébergement
  Railway configuré ou healthcheck.

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

1. Les agrégations et requêtes appartiennent à `src/lib/stats.ts` ; les routes API sérialisent
   les résultats ; les composants ne contiennent pas de logique métier.
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
8. La page expose uniquement l'aperçu du lot 0. Pas de placeholders, composants ou dépendances
   anticipant des lots futurs.

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

- Ajouter `getMatches` et `getMatchDetail`, ainsi que les routes GET
  `/api/matches.json` et `/api/matches/{id}.json`.
- Présenter les matchs complets, avec un détail consultable et un lien externe sûr
  (`rel="noopener"`).
- Afficher les matchs partiels dans une zone distincte, repliée par défaut.

**Terminé quand :** chaque match peut être consulté et les matchs partiels n'affectent aucun
indicateur d'équipe.

### LOT 2 — Joueurs et progression

- Calculer fiches joueurs, pools de champions, progression et rôles à partir des matchs
  pertinents ; ajouter les routes de données nécessaires.
- Afficher les cinq joueurs sans classement interne humiliant ; ajouter le détail joueur
  seulement si les données justifient un drill-down.
- N'ajouter que les graphiques utiles et testés.

**Terminé quand :** chaque fiche a des données vérifiées et des insights neutres ou positifs.

### LOT 3 — Récit collectif et synergies

- Ajouter timeline, séries, synergies de champions/joueurs et compositions, avec seuil minimal
  de matchs pour éviter les conclusions fragiles.
- Exposer des routes GET dédiées si le rendu serveur ne suffit pas.
- Rendre les sélections interactives seulement si leur usage est confirmé.

**Terminé quand :** les indicateurs excluent les matchs partiels et les seuils de fiabilité
sont visibles et testés.

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