# etoiles.win

Carnet de bord privé des Étoiles de l'Esport : comprendre les parties, préparer les
prochaines soirées et garder la mémoire de l'équipe.

## Démarrer

Prérequis : Node.js `>=22.23.4`.

```sh
npm ci
npm run dev
```

Le site est servi sur <http://localhost:4321>.
La base locale est vide au premier lancement ; voir le [guide opérationnel](./docs/OPERATIONS.md#synchroniser-les-données) pour la remplir.

## Documentation

- [Développer](./docs/DEVELOPMENT.md) — installation, principes techniques et vérifications
- [Exploiter](./docs/OPERATIONS.md) — synchronisation des données et déploiement Railway
- [Principes UX](./docs/UX_PRINCIPLES.md) — contraintes durables pour l'expérience

Le comportement de l'application est défini par le code et ses tests ; il n'est pas recopié
dans un catalogue de fonctionnalités.
