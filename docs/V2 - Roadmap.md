# etoiles.win V2 — réalisation et suite

Dernière mise à jour : 8 novembre 2026

La V2 est livrée par tranches cohérentes. Les cases « socle livré » décrivent le code
disponible; une collecte Riot réelle, une sauvegarde Railway et les fonctionnalités
qui nécessitent un service externe ne sont pas déclarées terminées sans validation.

## Parcours livrés

### V2.0 — Identité et expérience · socle livré

- Palette céleste bleu nuit, bleu électrique et or doux; constellation discrète, surfaces
  éditoriales et typographie système sans police Riot.
- Navigation partagée, responsive et persistante; mentions légales Riot conservées.
- Accueil racontant la dernière soirée, la forme collective, les cinq profils, l'historique
  et le collectif, à partir des données SQLite réelles.
- Les données d'équipe continuent d'exiger une partie classée Flex jouée par les cinq.

### V2.1 — Données enrichies · socle livré, collecte réelle à valider

- Migration SQLite V1 additive et transactionnelle; les tables, matchs, participants et
  réponses `raw_json` existants sont conservés.
- Collecte classée Solo/Duo (`queue 420`) avec curseurs indépendants; l'ingestion Flex
  existante (`queue 440`) reste en place.
- Les agrégats personnels lisent Solo/Duo et Flex séparément des matchs complets d'équipe.
  Les files non classées ne sont pas demandées.
- Lecture des entrées League-V4 et snapshots quotidiens par joueur/file, y compris un
  snapshot explicite sans rang. Aucun rang historique n'est fabriqué.
- Le patch est extrait de la version déjà persistée dans chaque Match-V5. Les périodes
  actuelles sont des années civiles et non une reconstitution des saisons compétitives.
- La collecte quotidienne de Solo/Duo commence avec un chevauchement de 24 heures si le
  curseur est vide. Un backfill historique est explicite (`npm run ingest -- --backfill`),
  paginé, reprenable et susceptible de durer selon les limites Riot.

### V2.2 — Statistiques · première tranche livrée

- Profils individuels par URL : volumes, taux avec effectif, champions, rôles, historique
  classé récent et snapshots de rang; aucune comparaison entre les cinq joueurs.
- Taux collectifs par patch avec ordre numérique et affichage prudent des échantillons
  inférieurs à cinq parties.
- Les données d'équipe, historiques et détails conservent leur périmètre queue 440 à cinq.
- Les insights multi-signaux, records enrichis et comparaisons temporelles avancées restent
  à développer; aucune phrase de causalité n'est générée.

### V2.3 — Draft Lab · première version fonctionnelle

- Sélection de cinq joueurs, de cinq rôles distincts et de cinq champions différents.
- Picks fréquents observés dans l'historique classé personnel proposés comme raccourcis,
  jamais comme recommandations.
- Comparaison d'une composition avec les matchs identiques à cinq; les bilans ne sont
  affichés qu'à partir de cinq occurrences.
- Associations calculées uniquement sur les Flex à cinq; les petits échantillons sont
  décrits sans winrate.
- Les bans, la comparaison côte à côte de plusieurs idées et la synergie théorique ne sont
  pas implémentés.

### V2.4 — Mémoire · première version livrée

- Chronologie des soirées de matchs complets; une pause de quatre heures sépare deux
  sessions, et l'heure de départ détermine leur date Europe/Paris.
- Filtre par année civile et archives de matchs incomplets dans une section distincte.
- URLs permanentes `/matches/{id}` avec résultat, patch, compositions, statistiques,
  objectifs et lien externe League of Graphs.
- Les pages détaillées peuvent aussi raconter un match individuel Solo/Duo.
- Les timelines Match-V5, retournements, multikills et récapitulatifs annuels illustrés
  ne sont pas livrés. Aucune timeline n'est téléchargée automatiquement.

### V2.5 — Automatisation · en partie déjà disponible

- L'ingestion planifiée et l'indicateur de fraîcheur existaient déjà et sont réutilisés;
  le webhook Discord, les images de partage personnalisées et les récapitulatifs
  automatiques ne sont pas configurés ni activés.
- La sauvegarde et le test de restauration Railway restent une opération à réaliser par
  le propriétaire du service; aucun déploiement n'a été effectué pendant cette mission.

## Architecture et données

- Astro SSR, SQLite `better-sqlite3`, SQL brut, Tailwind CSS v4 et Vitest sont conservés.
- `src/lib/db/schema.ts` reste le schéma initial; `src/lib/db/migrations.ts` applique les
  évolutions avec `PRAGMA user_version` dans des transactions.
- `matches.raw_json` reste la source historique du patch et des champs Match-V5. La table
  `participants` garde les participants suivis; les agrégats individuels relisent les
  participants nécessaires dans le JSON validé.
- `getMatches`, `getOverview`, `getPlayers` et les agrégats de composition filtrent la
  file Flex et le lineup de cinq. Les lignes Solo/Duo ne deviennent jamais une soirée,
  un résultat partiel Flex ou un match d'équipe.
- Les sessions de jeu utilisent un intervalle de quatre heures et le fuseau
  `Europe/Paris`. Le filtre annuel est civil et ne prétend pas refléter le calendrier
  compétitif de Riot.
- Les nouveaux enregistrements de rang sont une photographie journalière, pas une série
  de LP intrajournalière. Les entrées manquantes sont représentées comme non classées;
  les erreurs Riot restent des erreurs et ne créent pas de rang vide présenté comme réel.

## API Riot et assets

Sources officielles consultées le 8 novembre 2026 :

- [API Reference](https://developer.riotgames.com/apis)
- [League of Legends API policy and documentation](https://developer.riotgames.com/docs/lol)
- [Developer Portal and product registration](https://developer.riotgames.com/docs/portal)
- [Game-specific policies](https://developer.riotgames.com/policies/game-specific)
- [API Terms and Conditions](https://support-developer.riotgames.com/hc/en-us/articles/22698917218323-API-Terms-and-Conditions)

Match-V5 documente la liste des matchs par PUUID, le filtre `queue`, la pagination,
le paramètre temporel et l'endpoint de timeline. La liste ne remonte pas aux parties
antérieures à sa fenêtre de stockage (juin 2021); une timeline peut manquer pour une
partie. Les endpoints renvoient notamment `429` en cas de limite atteinte. Le client
conserve ses timeouts/retries et attend `Retry-After`; il n'envoie pas de rafale
parallélisée. Les quotas de production dépendent de la clé et ne sont pas supposés.

League-V4 est appelé sur le routage plateforme EUW (`RIOT_PLATFORM=euw1` par défaut).
La clé reste côté serveur dans `RIOT_API_KEY`. Les cinq comptes existants doivent être
configurés et une ingestion réelle validée avant d'activer ou de vérifier le planning.

La politique Riot consultée limite les ressources aux assets du press kit et aux données
statiques spécifiques au jeu, et exige le boilerplate légal visible. Les polices Beaufort
et Spiegel ainsi que les arrière-plans client non utilisés ont été retirés; les champions,
sorts et icônes de données statiques restent référencés localement. Une vérification
juridique supplémentaire reste au propriétaire de l'application.

### Pourquoi les timelines sont reportées

Le produit ne conserve pas encore de critère testé pour décider qu'une partie mérite une
timeline. En aspirer une pour chaque match gonflerait les appels et le stockage sans
garantir un souvenir utile. Une prochaine tranche devra définir et tester les événements
à extraire, stocker seulement un résumé compact idempotent, gérer les réponses absentes et
ne jamais rendre l'affichage dépendant d'une timeline.

## Parcours principaux

1. **Ouvrir l'accueil** : voir la dernière soirée à cinq, sa composition, le résultat et la
   forme collective; rejoindre l'historique, un profil ou le labo.
2. **Se souvenir** : parcourir les soirées par année, ouvrir un match permanent et comparer
   son patch, ses objectifs et ses deux équipes; les matchs incomplets restent à part.
3. **Explorer un parcours personnel** : depuis une fiche, consulter son historique classé,
   son pool, son rang le plus récent et les snapshots recueillis depuis la V2.
4. **Préparer une composition** : choisir les cinq joueurs, les rôles et les champions;
   utiliser ou ignorer les picks fréquents, puis consulter si l'idée a déjà été observée
   ensemble. Une absence d'historique est affichée comme telle.

## Validation et limites restantes

- À exécuter avant déploiement : `npm run check`, `npm test` et `npm run build`.
- À valider avec la clé et la base de production, sans exposer la clé : premier run
  incrémental, backfill Solo/Duo explicite, snapshots de rang, reprise après 429 et
  stabilité du volume SQLite Railway.
- À construire ensuite : backfill timelines sélectionnées et extraction d'événements,
  insights déterministes multi-signaux, saisons compétitives vérifiées, records,
  récapitulatif annuel, OG personnalisé, partage Discord optionnel et sauvegarde/restauration
  Railway testée.
- Les joueurs et PUUID sont conservés dans le même modèle sans authentification, comme
  l'application existante; les profils ne sont pas privés par contrôle d'accès.
- Aucune collecte Riot n'a été lancée depuis cette mission : la disponibilité effective
  des nouveaux endpoints dépend de la clé, des comptes et des limites du produit déployé.
