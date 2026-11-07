# etoiles.gg

Dashboard analytique des **Étoiles de l'Esport**, une équipe de cinq en classé flexible.
Les statistiques d'équipe ne comptent que les parties disputées avec les cinq joueurs.

## Démarrer en local

Prérequis : Node.js `>=22.23.4`.

```sh
npm ci
npm run dev
```

Le site est servi sur <http://localhost:4321>. La page d'accueil affiche le bilan réel
des matchs joués avec les cinq joueurs, calculé côté serveur depuis SQLite : taux de
victoire, forme des 20 derniers matchs, série en cours et meilleure série. Les matchs
partiels ne sont pas inclus ; sans match complet, un état vide est affiché.

Le style passe par Tailwind ; les tokens de la charte (couleurs, polices, animations)
sont définis dans `src/styles/global.css` et les composants réutilisables dans
`src/components/ui/`.

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
