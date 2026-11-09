# etoiles.win V2 — réalisation et suite

Dernière mise à jour : 9 novembre 2026

La V2 avance par tranches cohérentes. Le code disponible, les collectes réellement
validées et les fonctionnalités encore reportées sont distingués ci-dessous.

## Parcours livrés

### V2.0 — Identité et expérience · socle livré

- Palette céleste bleu nuit, bleu électrique et or doux; constellation discrète, surfaces
  éditoriales et typographie système sans police Riot.
- Navigation principale réduite à Accueil, Mémoire et Draft; pas de mélange entre liens de
  menu et ancres de sections.
- Accueil racontant la dernière soirée et la forme collective; les cinq profils apparaissent
  avant la constellation et l'historique.
- Accès aux profils présenté comme un bouton cohérent avec les interactions du site.
- Animation de FormStrip extraite en primitive générique et réutilisée sur les profils,
  avec respect de `prefers-reduced-motion`.
- Présentation des données par icônes : tuiles de champion avec volume (`ChampionTile`),
  présence des Étoiles en pastilles (`StarPresence`) au lieu de « n/5 Étoiles », filtres de
  rôles en icônes cliquables, emblèmes de rang et badges de file.
- Tooltips génériques (`TooltipLayer`) : tout élément portant `data-tip` affiche un
  bilan au survol ou au focus, y compris les éléments créés côté client.
- La règle collective reste inchangée : match Flex queue 440 joué par les cinq.

### V2.1 — Données enrichies · socle livré, collecte réelle à valider

- Migrations SQLite V1 à V6 additives et transactionnelles; les matchs, participants et
  réponses `raw_json` existants sont conservés. V3 répare aussi une base déjà marquée V2
  si elle n'a pas les colonnes de reprise des détails.
- Collecte classée Solo/Duo (`queue 420`) avec curseur distinct; collecte Flex (`queue 440`)
  conservée. Aucun mode non classé n'est demandé.
- Agrégats individuels distincts des bilans collectifs à cinq.
- Lecture League-V4 et snapshots quotidiens par joueur/file; aucun rang antérieur n'est
  fabriqué.
- Backfill par lots : deux pages de 100 IDs au plus par joueur/file et au plus 100 détails
  traités par exécution. Le curseur de page avance dans la même transaction que les IDs
  mis en file.
- `npm run sync -- status` expose les curseurs par joueur/file, les détails en attente et
  leur prochaine reprise. Les erreurs individuelles sont reprises avec backoff exponentiel;
  un seul match défaillant ne monopolise pas tous les lots suivants.
- Les timeouts Riot sont de 30 secondes; les limites et `Retry-After` restent respectés.
  La collecte réelle et la stabilité avec la clé et le volume de production restent à valider.

### V2.2 — Statistiques · première tranche livrée

- Les profils montrent d'abord les données du joueur dans les matchs à cinq : indicateurs
  d'équipe et liste complète de ses champions, triable par fréquence ou winrate.
- Sur desktop, les données à cinq et le parcours personnel sont côte à côte au lieu d'être
  empilés après un long défilement; sur mobile, ils sont empilés.
- Le tri par winrate privilégie les champions joués au moins cinq fois; les volumes sont
  affichés avec les taux.
- L'historique personnel récent indique aussi le nombre d'Étoiles présentes dans la partie.
- Solo/Duo, Flex et rangs sont toujours consultables, mais dans une section secondaire.
  Les emblèmes locaux sont utilisés pour les tiers connus.
- Trois découvertes déterministes : premier dragon et résultat, nouveau pick fréquent,
  pool personnel élargi à cinq. Les échantillons, seuils et parties sources sont accessibles;
  aucun emplacement n'est rempli quand les données ne justifient pas de découverte.
- Courbe du rang datée dans le profil, distincte pour Solo/Duo et Flex : à partir de deux
  relevés classés, sans inventer d'historique. Jours absents, périodes non classées et
  remises à zéro des compteurs interrompent la courbe.
- Les taux collectifs par patch restent calculés, mais leur panneau d'accueil sans question
  produit utile a été retiré.

### V2.3 — Draft · table unique livrée

- Une seule table : les cinq joueurs sont fixes, chacun à son siège selon son rôle principal
  déduit des matchs à cinq. Les anciennes sections « Explorer » et « Composer » sont fusionnées.
- Chaque siège propose en un clic ses champions joués à cinq (volume et bilan en tooltip),
  des pistes personnelles Solo/Duo/Flex jamais jouées à cinq, et un champ avec
  autocomplétion pour tout autre champion.
- Dès un pick, le verdict compare les parties à cinq qui réunissent ces champions sur ces
  joueurs : historique observé, liens vers les matchs, synergie observée par paire et paires
  jamais réunies. Sans historique, le pick est signalé comme suggestion exploratoire.
- Les compositions déjà jouées se filtrent selon les picks et se rechargent en un clic.
- Bans collectifs les plus fréquents affichés à côté de la table.
- L'état est partageable dans l'URL (`/draft?picks=A,B,,D,`, dans l'ordre des sièges).
- Les résultats ne consomment que les matchs Flex complets à cinq. Un échantillon inférieur
  à cinq reste un décompte sans taux ni recommandation. Aucune synergie théorique n'est
  présentée; comparaison côte à côte de plusieurs idées reportée.

### V2.4 — Mémoire · première version livrée

- Chronologie des soirées de matchs complets; une pause de quatre heures sépare deux
  sessions, et l'heure de départ détermine leur date Europe/Paris.
- Synthèse de la période sélectionnée (soirées, parties, bilan collectif et picks les plus
  joués en icônes) et navigation segmentée par année civile; chaque soirée résume ses
  résultats en losanges chronologiques.
- Archives des matchs incomplets conservées dans une section distincte.
- URLs permanentes `/matches/{id}` avec résultat, patch, compositions, statistiques,
  objectifs et lien externe League of Graphs.
- Records sur la période choisie : victoire la plus rapide, partie la plus longue,
  éliminations collectives, meilleure série et soirée parfaite (au moins trois victoires).
  Les records de durée excluent les parties de moins de dix minutes et les abandons précoces
  déclarés. Ce sont des repères parmi les parties archivées, pas des records Riot exhaustifs.
- Pentakills, quadrakills, séries et soirées parfaites alimentent les moments de la Mémoire,
  les badges de match et les éclats personnels. La bande d'accueil sélectionne au plus trois
  moments présents dans les dix dernières parties à cinq.
- Les données de multikill absentes restent inconnues, jamais interprétées comme zéro.
  La couverture multikills/timelines est indiquée dans la Mémoire.
- Courbe d'écart d'or et horaires des objectifs sur les pages de match et leurs dialogs.
  Une victoire après au moins 5 000 or de retard **observé dans les relevés** devient un
  moment « Rien n'était joué ». Sans timeline, aucun retournement n'est inféré.

### V2.5 — Synchronisation · socle livré, collecte réelle à valider

- Ingestion planifiée et indicateur de fraîcheur réutilisés.
- `update` et `history` récupèrent au plus dix timelines de matchs Flex à cinq par lot,
  après les détails et les rangs, seulement en l'absence d'erreurs. Même verrou,
  client HTTP, limites Riot et budget que la synchronisation existante.
- V6 stocke seulement l'or par relevé et les objectifs : aucun JSON brut de timeline,
  inventaire ou position. Une file persistante conserve tentatives, erreur et prochaine
  reprise. Un 404 est explicitement « indisponible chez Riot »; les autres erreurs
  échouent le lot avec reprise différée, un 429 arrête les appels de timeline.
- `sync status` distingue timelines disponibles, absentes et en attente. L'historique
  n'est terminé que lorsque les deux collectes, les détails et les timelines sont traités.
- Aucun appel Riot réel ni déploiement effectué pendant cette passe.

## Périmètre retenu après arbitrage

La suite validée est livrée dans cet ordre : moments et records, déroulé des matchs,
découvertes sobres, courbe de rang. Les travaux qui ne servent pas ces usages sont retirés
de la V2, pas conservés comme promesses implicites :

- récapitulatif annuel et images de partage;
- webhook Discord et images Open Graph;
- découpage par saisons compétitives Riot et tableaux par patch (le patch du match reste visible);
- comparaison de plusieurs compositions et synergie théorique;
- dette UX annexe (fond grand écran et repère de menu au scroll).

## Architecture et données

- Astro SSR, SQLite `better-sqlite3`, SQL brut, Tailwind CSS v4 et Vitest sont conservés.
- `src/lib/db/schema.ts` reste le schéma initial; `src/lib/db/migrations.ts` applique les
  évolutions avec `PRAGMA user_version` dans des transactions, y compris la création du
  socle et la reprise de `ingest_runs.finished_at`. Les versions futures sont refusées.
- La version persistante `data_revision` suit les écritures effectives des données métier,
  même lors d'une ingestion partiellement échouée. Les écritures opérationnelles seules
  (verrou, curseurs, file et statut) ne périment pas les statistiques.
- V6 ajoute `match_timelines` sans réécrire les lignes existantes. L'arrivée d'un résumé
  ou le changement de son statut invalide les lectures; une simple tentative différée
  ne les invalide pas. Réparer un match supprime son ancien résumé pour le recollecter.
- Les lectures coûteuses utilisent un cache mémoire borné par connexion/version :
  profils, résumés, bilan collectif non filtré, bans, soirées et historique de draft.
  Les résultats restent reconstructibles, les copies indépendantes et les filtres hors
  du cache. Le statut de synchronisation et le healthcheck restent frais.
- Le benchmark `npm run stats:benchmark` compare les résultats et les temps à froid/
  chaud sur des historiques synthétiques mixtes. Aucun précalcul persistant, ORM ou
  schéma en étoile n'est ajouté sans besoin confirmé par les mesures.
- `sync` est le seul point d'entrée de collecte, y compris pour le planificateur ;
  les anciens wrappers `ingest`, `ingest:backfill`, `ingest:status` et `resolvePuids` sont retirés.
- Les portraits de champions/profils et emblèmes de rang restent des images Riot originales,
  publiées au build sous une URL à empreinte de contenu et mises en cache un an par le navigateur.
- `matches.raw_json` conserve patch et champs Match-V5. `participants` conserve les
  Étoiles présentes; les profils personnels relisent les participants suivis dans le JSON
  validé.
- Curseurs temporels de collecte et curseurs de backfill sont séparés. Les IDs de match
  restent dans `ingest_pending` jusqu'à validation et écriture atomique; leur nombre
  d'essais et leur date de reprise sont persistés.
- `getMatches`, `getOverview`, `getPlayers` et les agrégats d'équipe restent filtrés par la
  file Flex et le lineup à cinq. Solo/Duo n'entre jamais dans les statistiques collectives.
- Les soirées utilisent quatre heures d'intervalle et le fuseau `Europe/Paris`; les
  périodes de la mémoire sont civiles et ne prétendent pas reconstruire les saisons Riot.
- Le rang est un snapshot journalier, pas une série intrajournalière de LP. Les entrées
  manquantes sont représentées comme non classées; une erreur Riot ne fabrique pas un rang.

## API Riot et assets

Sources officielles consultées les 8 et 9 novembre 2026 :

- [API Reference](https://developer.riotgames.com/apis)
- [Définition officielle Match-V5](https://developer.riotgames.com/api-details/match-v5)
- [League of Legends API policy and documentation](https://developer.riotgames.com/docs/lol)
- [Developer Portal and product registration](https://developer.riotgames.com/docs/portal)
- [Game-specific policies](https://developer.riotgames.com/policies/game-specific)
- [API Terms and Conditions](https://support-developer.riotgames.com/hc/en-us/articles/22698917218323-API-Terms-and-Conditions)

Match-V5 documente la liste des matchs par PUUID, le filtre `queue`, la pagination,
le paramètre temporel et l'endpoint de timeline. La liste ne remonte pas aux parties
antérieures à sa fenêtre de stockage (juin 2021); une timeline peut manquer pour une
partie. Les endpoints renvoient notamment `429`. Les appels restent séquentiels, le client
respecte `Retry-After`, et les quotas effectifs dépendent de la clé.

League-V4 utilise le routage plateforme EUW (`RIOT_PLATFORM=euw1` par défaut). Le nouvel
endpoint de rang et son accessibilité avec la clé réelle n'ont pas été vérifiés par un
appel de production. Les cinq comptes doivent être configurés et une ingestion réelle
validée avant d'activer ou de vérifier le planning.

Les mentions légales Riot restent visibles. Les polices Beaufort et Spiegel et les
arrière-plans client non utilisés ont été retirés; les champions, sorts et icônes de données
statiques restent référencés localement. Les emblèmes de rang présents dans
`public/riot/ranks/` sont utilisés dans le profil secondaire.

## Validation et limites restantes

- Après cette passe : `npm run check` sans erreur, 217 tests réussis et build de production
  validé. Accueil, Mémoire, profil et match contrôlés sur les données locales; courbes
  et parité page/dialog vérifiées sur une base de test séparée. Captures Chrome desktop
  et mobile 390 px, sans débordement horizontal sur les parcours vérifiés.
- La migration locale V5 vers V6 a été contrôlée en comparant l'empreinte complète des
  lignes de matchs, participants, rangs et file de détails avant/après : aucune modification.
- Benchmark des parcours enrichis sur 1 000 matchs synthétiques : résultats identiques,
  cache borné, lectures à chaud entre 33 et 327 fois plus rapides que sans cache
  (mesure locale de la couche données, pas de la latence web).
- Base locale après migration : 342 matchs (293 Flex, 49 Solo/Duo), 772 participants et
  61 lineups Flex complets conservés; 608 détails sont en attente et prêts à traiter.
  Aucun backfill, appel Riot réel, snapshot de rang ou déploiement n'a été déclenché.
- À valider avec la clé et la base de production, sans révéler la clé : `npm run sync -- update`,
  lots `npm run sync -- history`, reprise après interruption/429, endpoint League-V4,
  snapshots et stabilité du volume Railway.
- La collecte réelle des timelines reste à déclencher par `sync update` ou `sync history`.
  Les états en attente et indisponibles sont affichés explicitement. Les courbes de rang
  nécessitent deux dates classées; les snapshots existants d'une seule journée ne suffisent pas.
- Règles des découvertes : premier dragon avec au moins 10 parties dans chacun des deux
  groupes et 15 points d'écart de taux; nouveau pick joué au moins 5 fois sur les 10 dernières
  parties, jamais sur les 20 précédentes; pool élargi d'au moins 3 champions sur deux
  fenêtres consécutives de 20 parties. Ces seuils éditoriaux ne constituent pas des tests
  de significativité ni des preuves de causalité.
- Les profils ne sont pas protégés par authentification; ils restent accessibles à toute
  personne qui peut atteindre le site, comme dans l'application existante.

## Parcours principaux

1. **Accueil** : voir la dernière soirée, la forme collective puis les cinq profils; ouvrir
   les moments récents, une découverte sourcée ou préparer une idée de draft.
2. **Mémoire** : comparer les repères d'une année, voir les picks marquants de la période,
   retrouver ses records et moments, parcourir les soirées et ouvrir une page permanente
   de match avec son déroulé lorsqu'il est disponible.
3. **Profil** : lire les champions et statistiques à cinq, ouvrir une partie pour en voir
   les détails, retrouver les multikills à cinq et consulter le parcours classé personnel
   avec les relevés de rang datés.
4. **Draft** : cliquer un champion sur un ou plusieurs sièges, lire l'historique et les
   synergies observées, recharger une composition déjà jouée puis copier le lien.
5. **Synchronisation** : lancer `npm run sync -- update` pour les nouveautés; lancer plusieurs fois
   `npm run sync -- history` pour le passé disponible, et vérifier l'avancement avec
   `npm run sync -- status`.
