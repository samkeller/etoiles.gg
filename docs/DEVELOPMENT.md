# Développer

## Installer et lancer

Node.js `>=22.23.4` est requis.

```sh
npm ci
npm run dev
```

Le site s'ouvre sur <http://localhost:4321>.

## Principes techniques

- Le comportement effectif est défini par le code et les tests. Ne pas recopier ici les règles métier ou le détail des fonctionnalités : documenter dans le code l'intention et les contraintes non évidentes.
- Le projet reste une application Astro SSR avec SQLite et SQL direct. Ne pas ajouter ORM, microservices, cache persistant ou infrastructure dédiée sans besoin mesuré qui le justifie.
- Les agrégations sont regroupées dans `src/lib/stats/`; les routes et vues doivent les réutiliser plutôt que recalculer les règles.
- Les tests de statistiques utilisent les fixtures SQLite partagées de `src/lib/stats/fixtures.ts`.
- `src/lib/db/schema.ts` définit le socle historique de la base ; les changements futurs passent par une nouvelle migration versionnée dans `src/lib/db/migrations.ts`. Ne jamais modifier une migration déjà publiée. Tester une base neuve et les versions précédentes concernées ; garder la migration atomique et les données existantes.
- Les tokens visuels sont dans `src/styles/global.css`; réutiliser les composants de `src/components/ui/` et les principes [produit et UX](./UX_PRINCIPLES.md).

## Commandes de développement

| Besoin | Commande |
| --- | --- |
| Installer les dépendances exactement selon le lockfile | `npm ci` |
| Lancer le serveur local | `npm run dev` |
| Lancer les tests | `npm test` |
| Vérifier TypeScript et Astro | `npm run check` |
| Construire le site | `npm run build` |
| Afficher l'aide de synchronisation | `npm run sync -- help` |

Le démarrage local n'exige pas de clé Riot ; une clé est nécessaire pour les commandes
qui contactent Riot. La configuration des variables est décrite dans le fichier
[`.env.example`](../.env.example).

## Vérifier les changements

```sh
npm test
npm run check
npm run build
```

Pour des statistiques, tester les cas sans données, les données partielles et les
seuils pertinents dans les tests existants.
