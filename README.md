# etoiles.gg

Dashboard analytique des **Étoiles de l'Esport**, une équipe de cinq en classé flexible.
Les statistiques d'équipe ne comptent que les parties disputées avec les cinq joueurs.

## Démarrer en local

Prérequis : Node.js `>=22.23.4`.

```sh
npm ci
npm run dev
```

Le site est servi sur <http://localhost:4321>. Les statistiques restent volontairement
vides tant que l'ingestion Riot n'est pas configurée : aucune donnée de démonstration
n'est présentée comme réelle.

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

Copier `.env.example` vers `.env` et renseigner `RIOT_API_KEY` avant de configurer
l'ingestion. Ne jamais committer `.env` ni une clé Riot. La base SQLite locale sera
stockée dans `data/`, dossier ignoré par Git.

## Stack

- Astro et Preact pour les îlots interactifs
- Rendu serveur Astro via l'adaptateur Node (compatible Railway)
- Tailwind CSS v4
- Vitest
- SQLite avec `better-sqlite3` (à intégrer avec le batch d'ingestion)
