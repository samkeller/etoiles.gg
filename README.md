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
- le récit collectif : séries de victoires avec résultats cliquables,
  associations joueur/champion et compositions à cinq ;
- l'historique des matchs à cinq, avec le détail de chaque match dans une fenêtre, et à
  part les matchs partiels (2 à 4 joueurs), qui ne comptent dans aucune statistique.

Les données sont aussi exposées en JSON (GET) :

| Route | Contenu |
| --- | --- |
| `/api/matches.json?scope=full\|partial` | Liste des matchs (`full` par défaut) |
| `/api/matches/{id}.json` | Détail d'un match (400 si l'id est invalide, 404 s'il est inconnu) |
| `/api/players.json` | Fiches des cinq joueurs |

Le style passe par Tailwind ; les tokens de la charte (couleurs, polices, animations)
sont définis dans `src/styles/global.css` et les composants réutilisables dans
`src/components/ui/`. Les agrégations sont dans `src/lib/stats/`.

## Lire les observations de draft

Seules les associations et compositions jouées **au moins 5 fois à cinq** sont affichées,
par taux de victoire décroissant, puis par nombre de matchs en cas d'égalité,
avec nombre de matchs et bilan V/D. Le trait
clair sur les barres indique le taux de victoire global de l'équipe.

Une association identifie deux joueurs avec leurs champions ; une composition complète
identifie les cinq joueurs, champions et rôles. Les duos de joueurs seuls ne sont pas
comparés : les cinq étant toujours présents, ils auraient tous le même bilan.
Les petits échantillons et les associations qui se recoupent ne prouvent pas une synergie
et ne constituent pas une recommandation de draft. Sans cinq matchs pour une composition,
un état explicite est affiché.

Les synergies peuvent être filtrées sur un rôle (tous les duos qui le contiennent) ou
deux rôles (ce duo précis). Le bilan et le seuil de 5 matchs sont recalculés sur les
parties réellement jouées à ces rôles, pas sur le rôle principal ou le dernier rôle du
joueur. Ce filtre ne modifie ni les séries, ni les compositions complètes.
Le formulaire fonctionne sans JavaScript et conserve la sélection dans l'URL
(`?role=JUNGLE&role2=UTILITY#collective-title`) ; « Réinitialiser » retrouve tous les duos.
Les sélecteurs utilisent la primitive Tailwind `RoleSelect` : cadre Hextech et icône Riot
du rôle sélectionné, mise à jour par CSS sans JavaScript. Le contrôle natif conserve
sa navigation clavier et sa liste système sur mobile.

Les séries ne portent que sur les matchs à cinq : les résultats partiels ne les
interrompent pas. Les résultats des séries
et le dernier match de chaque observation ouvrent le détail existant, sans nouvel endpoint.

## Commandes

| Commande | Action |
| --- | --- |
| `npm run dev` | Démarre Astro en développement |
| `npm run check` | Vérifie les types et composants Astro |
| `npm test` | Exécute les tests Vitest |
| `npm run build` | Construit le site de production |
| `npm start` | Démarre le serveur Node de production |
| `npm run preview` | Prévisualise le build |
| `npm run ingest` | Lance l'ingestion des matchs flex pour les PUUIDs configurés |
| `npm run ingest -- --backfill` | Lance l'ingestion complète (sans date de début) des matchs flex pour les PUUIDs configurés |
| `npm run resolvePuids -- "Pseudo#TAG"` | Résout le PUUID d'un joueur via son Riot ID et l'enregistre en base |
| `npm run syncAssets` | Télécharge les icônes de profil et de champions (Data Dragon) et génère les noms FR des champions |

## Configuration

Copier `.env.example` vers `.env` et renseigner `RIOT_API_KEY` avant de lancer
l'ingestion. Ne jamais committer `.env` ni une clé Riot. La base SQLite est stockée
dans `./etoiles.db` par défaut (chemin configurable avec `DATABASE_PATH`), fichier ignoré
par Git.

## Stack

- Astro
- Tailwind CSS 4
- Rendu serveur Astro via l'adaptateur Node (compatible Railway)
- Vitest
- SQLite avec `better-sqlite3`
