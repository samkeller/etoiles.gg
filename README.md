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
