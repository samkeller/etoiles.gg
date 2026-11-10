# Project

Suivi des tâches identifiées par l'agent IA — hors-scope du travail en cours.
Ce fichier est maintenu par l'agent ; le développeur valide et déplace.

<!-- If you are an agent, feel very welcome to update this file and put anything you thinks is relevant here !! -->

<em>[TODO.md spec & Kanban Board](https://bit.ly/3fCwKfM)</em>

### Todo

- [ ] [MEDIUM] Réduire la dette UX dans un chantier transversal dédié, sans correction pendant le développement courant : auditer composants et écrans pour repérer accumulation d'informations, redondances, interactions inutiles et surcharge visuelle ; traiter d'abord les causes structurelles (composants partagés, comportements par défaut, conventions), selon « essentiel visible, détail utile accessible explicitement, répétition supprimée », sans perdre les informations utiles — exemples : tooltips, RoleIcon, badges Solo/Flex, bilan de soirée, ChampionTile en ligne, champions adverses de draft, statistiques du profil ; cibles : src/components/ui, src/components/players, src/components/memory/SessionConstellation.astro, src/pages/draft.astro, src/pages/players/[puuid].astro ; référence : [UX_PRINCIPLES.md](./UX_PRINCIPLES.md) ; effort estimé : important
- [ ] [MEDIUM] Revoir globalement les seuils et la présentation des petits échantillons, notamment les synergies de draft (3 parties avec signal atténué, puis 5 envisagées sans garantie statistique) — cible : src/lib/stats/collective.ts, src/lib/stats/draft.ts et affichages app-wide, conserver 5 en attendant, effort estimé : moyen
- [ ] [MEDIUM] Mesurer puis limiter le coût du rendu des longues archives par pagination ou chargement progressif — cible : src/pages/history.astro, rendu HTTP chaud environ 130 ms sur 1 000 matchs synthétiques malgré le cache des données, effort estimé : moyen
 
### In Progress

- [ ]

 
### Review

- [ ]

### Done ✓

- [ ]
