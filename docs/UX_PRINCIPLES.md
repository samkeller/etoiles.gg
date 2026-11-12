# Principes produit et UX

Ces principes guident les décisions qui ne peuvent pas être déduites du code. Ils ne
décrivent pas les fonctionnalités livrées et ne constituent pas une demande de refonte.

## Intention produit

- Le produit aide l'équipe à **comprendre**, **préparer** et **se souvenir** ; ces usages
  forment une expérience cohérente, pas trois applications indépendantes.
- Les données individuelles servent la progression et la découverte personnelles, jamais
  la compétition entre coéquipiers. Ne pas créer de classement humiliant ni présenter les
  cinq profils comme une hiérarchie.
- Une statistique observée reste descriptive : la contextualiser, montrer son échantillon
  et son incertitude, et ne pas la transformer en causalité ou recommandation.
- Ne jamais inventer des résultats, des données historiques ou une confiance que les
  données ne justifient pas. Signaler honnêtement les limites et l'absence de données.
- Garder le produit simple à utiliser et à maintenir. Une nouvelle fonctionnalité ou
  dépendance doit répondre à un besoin concret, pas seulement être possible.

## Expérience

- Prolonger l'existant : palette nocturne, or et bleu, typographie, composants de `src/components/ui` et utilitaires Tailwind ; réutiliser les tokens de `src/styles/global.css`.
- Garder l'essentiel visible ; rendre les détails utiles accessibles à la demande ; supprimer les répétitions.
- Choisir les données selon la question de l'utilisateur, pas selon leur disponibilité. Préférer quelques chiffres comparables aux phrases explicatives concaténées.
- Pour un winrate observé, montrer le taux et son échantillon ; représenter l'incertitude par un intervalle horizontal avec un point pour le taux (`ObservedWinRate`). Aucun taux sans rencontre ; ne pas assimiler un taux observé à une recommandation.
- Préserver une hiérarchie lisible : ne pas multiplier textes secondaires, badges, couleurs ou animations sans bénéfice de compréhension.
- Réserver chaque tooltip à un complément court et utile ; ne pas répéter les libellés ou statistiques visibles. Placer les explications longues dans une aide explicite.
- Ne pas ajouter une interaction parce qu'un composant le permet. Une icône décorative n'a pas besoin de tooltip ; conserver les libellés accessibles nécessaires.
- Avant de livrer, vérifier le rendu : que peut-on simplifier ou supprimer sans perdre d'information utile ? Animer un changement pertinent, pas décorer systématiquement.

Si un cas concret contredit un principe, exposer le compromis et proposer son évolution ; ne pas élargir la tâche pour corriger l'existant.
