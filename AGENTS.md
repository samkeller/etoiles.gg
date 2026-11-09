## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## TODO_agents.md
Il existe deux fichiers de suivi distincts :

- `TODO.md` : backlog personnel du développeur. Ne JAMAIS le modifier, ni le lire pour décider des actions. Il n'est pas accessible à l'agent. 
- `TODO_agent.md` : backlog de l'agent. Seul fichier de tâches que tu peux écrire.

### Quand écrire dans TODO_agent.md

Si tu identifies pendant ton travail une amélioration, un bug adjacent, un refactoring ou une dette technique hors du périmètre de la tâche en cours, ne l'implémente pas : ajoute-la dans `TODO_agent.md`.

### Format des entrées

- Une entrée = une action atomique, à l'infinitif, en français.
- Préfixe de priorité entre crochets : [HIGH], [MEDIUM] ou [LOW].
  Règles : sécurité/bug bloquant/cassure UX = HIGH; dette technique, homogénéité, perf = MEDIUM ; cosmétique/nice-to-have = LOW.
- Contexte utile en fin de ligne : fichier(s) concerné(s), bibliothèque suggérée, effort estimé — sur une seule ligne.
- Exemple :`- [ ] [MEDIUM] Factoriser les boutons Supprimer/Renommer en atoms DeleteButton/EditButton — cible : composants/atoms, garder compat ButtonProps`
