# Principes UX

Base minimale et évolutive pour les prochaines interventions, pas une demande de refonte.

- Prolonger l'existant : palette nocturne, or et bleu, typographie, composants de `src/components/ui` et utilitaires Tailwind ; réutiliser les tokens de `src/styles/global.css`.
- Garder l'essentiel visible ; rendre les détails utiles accessibles à la demande ; supprimer les répétitions.
- Choisir les données selon la question de l'utilisateur, pas selon leur disponibilité. Préférer quelques chiffres comparables aux phrases explicatives concaténées.
- Préserver une hiérarchie lisible : ne pas multiplier textes secondaires, badges, couleurs ou animations sans bénéfice de compréhension.
- Réserver chaque tooltip à un complément court et utile ; ne pas répéter les libellés ou statistiques visibles. Placer les explications longues dans une aide explicite.
- Ne pas ajouter une interaction parce qu'un composant le permet. Une icône décorative n'a pas besoin de tooltip ; conserver les libellés accessibles nécessaires.
- Avant de livrer, vérifier le rendu : que peut-on simplifier ou supprimer sans perdre d'information utile ? Animer un changement pertinent, pas décorer systématiquement.

Si un cas concret contredit un principe, exposer le compromis et proposer son évolution ; ne pas élargir la tâche pour corriger l'existant.
