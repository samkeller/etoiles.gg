## 1. Ma vision de etoiles.win V2

Je ne veux pas simplement transformer un dashboard de statistiques en un dashboard de statistiques plus joli.

Je veux faire de etoiles.win le quartier général des Étoiles de l'Esport.

Un endroit qui raconte l'histoire de l'équipe, permet de comprendre ses habitudes, donne envie de préparer les prochaines parties et fournit des pistes concrètes pour progresser ensemble.

Il faut réunir trois dimensions :

League of Legends champion preview dashboard | League of legends, Game websites, Dashboard design

1. Comprendre

Des statistiques intelligentes, contextualisées et exploitables. Pas une accumulation de chiffres : des informations qui permettent de mieux comprendre nos parties.

Rift Oracle | Devpost

2. Préparer

Un véritable espace de préparation : champions, picks, bans, habitudes, synergies et idées de compositions.

Cosmic Connector — Art League Houston

3. Se souvenir

Une mémoire collective, des soirées, des moments marquants, des records et une identité visuelle qui donne envie de parcourir l'histoire de l'équipe.

Ces trois dimensions doivent être complémentaires, pas devenir trois applications différentes.

### Les décisions que je prends

- Identité visuelle : je reviendrais vers l'univers des étoiles et des constellations de la première maquette, mais sans abandonner les codes graphiques de League of Legends. Je veux une identité propre à l'équipe, pas un clone d'OP.GG. Hextech peut rester une inspiration, pas une identité imposée.
- Desktop-first : je ne ferais pas du mobile une priorité produit. Il doit néanmoins être propre, responsive et utilisable. L'application sera principalement consultée sur ordinateur.
- Statistiques individuelles : oui, mais dans une logique de progression personnelle et de découverte, jamais de compétition entre les cinq joueurs.
- Parties solo et duo : oui, je souhaite explorer leur récupération pour enrichir les profils personnels. Les statistiques collectives à cinq restent strictement séparées.
- Rang et LP : oui, c'est une information intéressante pour contextualiser l'évolution de l'équipe et des joueurs.
- Timelines : oui, mais uniquement si elles permettent de raconter des événements réellement intéressants. Je ne veux pas une visualisation minute par minute simplement parce que l'API le permet.
- Saisons et patchs : oui. Ils constituent d'excellents repères pour comprendre l'évolution du jeu et des performances.
- Historique des pseudos : à conserver dans les données si possible, mais à traiter discrètement. C'est une question de continuité historique, pas une fonctionnalité centrale.
- Préparation de draft : oui, c'est probablement l'une des évolutions les plus intéressantes.
- Notes manuelles : non. Je veux conserver une application en lecture seule, sans authentification, sans gestion éditoriale et sans contraintes de sécurité supplémentaires.
- Discord : oui au partage et aux récapitulatifs, mais pas de notifications intrusives.
- IA : pas de fonctionnalité IA artificielle ajoutée pour faire moderne.
- Classements humiliants : absolument pas. Cette règle est fondamentale.

Une nuance importante : le fait que l'équipe soit très active change beaucoup mon analyse. Les quatre mois de silence ne doivent pas être interprétés comme une preuve de désengagement. Je préfère concevoir un produit qui accompagne une activité déjà existante plutôt qu'un produit qui essaie de la provoquer.

## 2. La roadmap V2 que je veux construire

Je découperais le projet en six grands chantiers, avec une vraie progression logique.

# etoiles.win — V2

Vision produit retenue# Fait à cinq, pour les cinq. ✦

Un carnet de bord vivant, un outil de progression collective et un espace de préparation.

## Les six chantiers

1. Nouvelle identité et expérience — donner une vraie personnalité au produit.
2. Données enrichies — exploiter intelligemment les données Riot et les parties individuelles.
3. Statistiques intelligentes — transformer les données en enseignements.
4. Laboratoire de draft — préparer les prochaines parties.
5. Mémoire de l'équipe — raconter les soirées, les saisons et les moments marquants.
6. Partage et automatisation — rendre le produit vivant et facile à partager.

### Chantier 1 — Une véritable identité graphique

Astro Cocktail Bar | 4 Exmouth Market, London, UK

Zenith - Interactive Constellations Viewer :: Behance

Emberglyph: Product Design for Fantasy Card Battle Game by Gapsy Studio on Dribbble

Je veux retrouver l'âme du projet initial.

Quelques principes :

- Fond nocturne profond, constellations et étoiles.
- Bleu nuit, nuances de bleu électrique et or.
- Une typographie élégante et lisible.
- Des éléments graphiques propres à l'équipe.
- Des transitions discrètes et des animations qui donnent de la vie.
- Une hiérarchie éditoriale plutôt qu'une succession de tableaux statistiques.

Je veux que le site ait une identité reconnaissable, même si on retire tous les logos de League of Legends.

L'or doit être une récompense visuelle, pas une couleur utilisée partout.

La page d'accueil devrait notamment présenter la dernière soirée, l'activité récente et une synthèse de la vie de l'équipe.

### Chantier 2 — Enrichissement des données

C'est probablement le chantier qui conditionne le reste.

Je veux étudier sérieusement la possibilité de récupérer :

- Toutes les parties classées Solo/Duo des cinq joueurs.
- Toutes les parties classées Flex.
- Les statistiques individuelles indépendamment de la présence des cinq joueurs.
- Les rangs et LP Solo/Duo et Flex.
- Les historiques de rang lorsque nous avons commencé à les enregistrer.
- Les données de patch associées à chaque match.
- Les timelines des parties pertinentes.

Il faut impérativement distinguer deux univers :

Univers collectif : les statistiques de l'équipe lorsqu'elle joue à cinq en Flex. Les règles existantes de calcul restent intactes.

Univers individuel : les statistiques personnelles en classé, Solo/Duo et Flex, sans transformer les données individuelles en classement entre amis.

Je veux aussi que le modèle de données permette de répondre à une question essentielle :

« Est-ce que nous progressons ? »

Cela implique de comparer des périodes cohérentes, des patchs et des saisons, sans tirer de conclusions abusives sur de petits échantillons.

### Chantier 3 — Des statistiques qui racontent quelque chose

League of Legends champion preview dashboard | League of legends, Game websites, Dashboard design

League of Legends Analytics Dashboard, Kristian Akerstrom | Data visualization design, Information visualization, Dashboard design

Dashboard - League of Legends Analytics by Artyom Bukharov on Dribbble

Je veux conserver les indicateurs existants, mais introduire des analyses plus intelligentes.

Quelques exemples :

- Nos champions les plus joués et ceux avec lesquels nous avons obtenu nos meilleurs résultats.
- Nos compositions les plus fréquentes.
- Les champions qui semblent bien fonctionner ensemble.
- Nos habitudes de draft.
- Les objectifs associés à nos victoires et défaites.
- Notre évolution par saison et par patch.
- Les tendances individuelles.
- Les moments de jeu remarquables.
- Les évolutions de rang.

Une règle : les statistiques doivent toujours afficher leur contexte et leur taille d'échantillon.

Je préfère « tendance intéressante sur 8 parties » à « vous avez 83 % de chances de gagner avec ce champion ».

Je veux également des analyses positives, qui donnent des pistes de progression sans désigner un coupable.

### Chantier 4 — Un véritable laboratoire de draft

Riftprep — The Operating System for Competitive League of Legends Teams

DraftForge | Draft Coach for League of Legends

Rift Oracle | Devpost

C'est une fonctionnalité que je trouve particulièrement prometteuse.

Imagine un espace où les cinq joueurs peuvent préparer une prochaine soirée.

On pourrait :

- Sélectionner les cinq joueurs et leurs rôles.
- Consulter leurs champions les plus joués.
- Voir leurs statistiques sur les picks.
- Identifier les champions peu expérimentés.
- Visualiser les champions souvent bannis.
- Explorer les compositions déjà jouées.
- Découvrir des associations intéressantes.
- Comparer plusieurs compositions envisagées.

Je ne veux pas créer un simulateur de draft professionnel.

Je veux un outil de réflexion et d'inspiration pour cinq amis qui veulent progresser ensemble.

Il faudra distinguer clairement les synergies observées, les synergies théoriques et les simples suggestions.

### Chantier 5 — La mémoire des Étoiles

Antique Celestial Map — Golden Constellations on Deep Blue — Jigsaw Puzzle — PuzzleFree

Syndra Build Guide : \[PRE-SEASON\] Syndra, the Dark Sovereign (AP Mid Carry) :: League of Legends Strategy Builds

Celestial Scrapbook Ideas: Moon, Stars & Printable Paper | Pixel Scrap

C'est ici que je veux réintroduire les meilleures idées de la spécification v0.2.

- Une chronologie des soirées.
- Une représentation visuelle des matchs sous forme de constellation.
- Des saisons et des chapitres.
- Les matchs marquants.
- Les records collectifs.
- Les séries de victoires.
- Les moments exceptionnels.
- Un récapitulatif annuel façon Wrapped.
- Une carte d'identité graphique de l'équipe.

Je veux également des pages individuelles pour les joueurs, qui racontent leur évolution sans les comparer négativement aux autres.

Chaque match devrait avoir sa propre URL et une page de détail digne de ce nom.

### Chantier 6 — Partage et automatisation

Enfin, je veux que le produit soit capable de vivre sans intervention manuelle.

- Images Open Graph personnalisées.
- Liens de partage vers les matchs.
- Récapitulatif automatique des soirées.
- Possibilité de partager une composition.
- Publication facultative du récapitulatif sur Discord via webhook.
- Mise à jour automatique des statistiques.
- Affichage clair de la date de dernière synchronisation.

Pas de spam, pas de notifications permanentes.

Le partage doit être une possibilité, pas une obligation.

## 3. Quelques choix techniques et méthodologiques importants

J'ai également fait quelques recherches complémentaires dans la documentation officielle Riot.

Il faut notamment prendre en compte :

- Match-V5 expose les données des matchs et leurs timelines.
- League-V4 permet de récupérer des informations de classement.
- Les listes de matchs peuvent être interrogées par PUUID et filtrées selon la file et le type.
- Les données historiques de rang ne sont pas magiquement disponibles : il faudra les enregistrer au fil du temps si l'on veut construire des courbes d'évolution.

Documentation à consulter :

- [Référence officielle des API Riot](<https://developer.riotgames.com/apis/?utm_source=chatgpt.com>).
- [Documentation et politiques League of Legends](<https://developer.riotgames.com/docs/lol?utm_source=chatgpt.com>).
- [Règles des clés API et limites de requêtes](<https://developer.riotgames.com/docs/portal?utm_source=chatgpt.com>).

Le point important : le rapport initial a mal interprété la situation de la clé API. Tu confirmes disposer d'une clé de production en production. Ce sujet ne doit donc pas bloquer le projet.

Il en va de même pour les autres assets du projet : tous les usages d'images, polices etc sont conformes et OK, cela ne doit plus être un sujet.

Et surtout, je veux conserver Astro, SQLite et l'architecture actuelle tant qu'aucune raison concrète ne justifie leur remplacement.

## 4. Le prompt final pour le dernier agent

Cette fois, je veux changer radicalement la nature de sa mission.

Il ne doit plus simplement analyser et proposer. Il doit devenir le Lead Product Designer + Lead Developer responsable de la V2.

Je lui donne une vision, une direction et une certaine liberté créative. Je veux qu'il prenne des décisions, qu'il construise quelque chose de cohérent et qu'il ne se contente pas d'exécuter mécaniquement une liste de fonctionnalités.

Voici le prompt à lui transmettre.

Writing

# ✦ MISSION FINALE — ETOILES.WIN V2

## Transformer un dashboard de statistiques en quartier général des Étoiles de l'Esport

Tu es le dernier agent à intervenir sur ce projet dans le cadre de cette mission.

Tu as accès à l'intégralité du dépôt, de son historique, de ses fichiers, de sa documentation, de sa base de données et de ses ressources.

Tu disposes également d'une vision produit validée par le propriétaire du projet.

Cette fois, il ne s'agit plus de réaliser un audit ou de présenter des idées.

**Ta mission est de concevoir et de réaliser une véritable V2 du produit.**

Tu as une grande liberté créative et technique, mais tu dois respecter l'ADN du projet et les décisions exposées ci-dessous.

---

# 1\. LE PRODUIT ET SON IDENTITÉ

Le projet s'appelle **etoiles.win**.

Il s'agit d'un espace privé destiné à cinq amis qui jouent ensemble à League of Legends, principalement en classé flexible.

L'équipe s'appelle :

**Les Étoiles de l'Esport.**

Le projet est un cadeau destiné aux cinq joueurs.

Ce n'est pas un produit commercial, un SaaS, un tracker public ou un concurrent d'OP.GG.

C'est un outil personnel qui doit permettre :

- De retrouver et parcourir les anciennes parties.
- De comprendre les habitudes de l'équipe.
- De progresser individuellement et collectivement.
- De découvrir de nouvelles idées de champions et de compositions.
- De préparer les prochaines soirées.
- De conserver une mémoire de l'équipe.

L'équipe est active et continue de jouer régulièrement.

Le site est déjà en ligne sur etoiles.win.

Une clé API Riot de production est déjà utilisée en production. Ce point est réglé et ne constitue pas un blocage.

Le public cible est constitué exclusivement des cinq joueurs.

L'application doit rester simple à utiliser et à maintenir.

## La philosophie fondamentale

Je veux un produit qui encourage les joueurs et leur donne envie de progresser ensemble.

Il ne doit jamais devenir un outil de jugement ou de compétition interne.

Les niveaux des joueurs sont hétérogènes.

En conséquence :

- Aucun classement humiliant entre joueurs.
- Aucun score global permettant de désigner le meilleur ou le pire.
- Aucune présentation culpabilisante des statistiques.
- Aucun indicateur artificiel de performance individuelle.
- Aucun commentaire négatif généré automatiquement sur un joueur.

Les statistiques individuelles sont les bienvenues lorsqu'elles permettent de comprendre une progression personnelle, une spécialité ou une évolution.

Les statistiques collectives doivent rester rigoureuses.

La règle actuelle des parties à cinq pour les statistiques collectives est fondamentale et doit être conservée.

**La philosophie est : progresser ensemble, célébrer ensemble, se souvenir ensemble.**

---

# 2\. LA VISION PRODUIT

Je veux faire d'etoiles.win le quartier général des Étoiles de l'Esport.

Le produit doit réunir trois grandes dimensions.

### A. COMPRENDRE

Un espace de statistiques intelligent.

Il doit aider à comprendre :

- Comment l'équipe joue.
- Quelles compositions fonctionnent.
- Quels champions sont privilégiés.
- Quels objectifs sont associés aux victoires.
- Comment les habitudes évoluent.
- Comment chaque joueur progresse individuellement.

Les statistiques ne doivent jamais être présentées sans contexte.

### B. PRÉPARER

Un espace de préparation des prochaines parties.

Il doit permettre :

- D'explorer les pools de champions.
- De réfléchir aux compositions.
- De consulter les habitudes de draft.
- De découvrir des associations intéressantes.
- De préparer des idées de picks et de bans.

Ce n'est pas un simulateur professionnel.

C'est un laboratoire d'idées pour une équipe de cinq amis.

### C. SE SOUVENIR

Un carnet de bord collectif.

Il doit raconter :

- Les soirées.
- Les saisons.
- Les matchs marquants.
- Les records.
- Les évolutions.
- Les moments exceptionnels.

Je veux retrouver l'idée originale de la constellation, mais lui donner une véritable fonction dans le produit.

Ces trois dimensions doivent former une expérience unifiée.

Ne construis surtout pas trois applications indépendantes.

---

# 3\. DIRECTION ARTISTIQUE

C'est un élément extrêmement important de la mission.

Le projet a initialement possédé une identité autour des étoiles, des constellations et de l'idée :

**« Fait à cinq, pour les cinq. ✦ »**

Cette identité a été progressivement remplacée par une interface davantage inspirée de l'univers Hextech de League of Legends.

Je souhaite retrouver l'identité céleste initiale.

## Direction visuelle souhaitée

Imagine un mélange entre :

- Un carnet de bord astronomique.
- Un univers fantasy nocturne.
- Un tableau de bord esport haut de gamme.
- Une expérience éditoriale moderne.

Palette indicative :

- Bleu nuit très profond.
- Bleu électrique.
- Or doux.
- Blanc cassé.
- Quelques nuances intermédiaires.

Éléments graphiques possibles :

- Constellations.
- Étoiles.
- Cartes célestes.
- Orbites.
- Lignes de connexion.
- Motifs astronomiques.
- Illustrations de champions intégrées avec subtilité.

L'univers League of Legends doit rester identifiable, mais l'identité graphique doit appartenir aux Étoiles de l'Esport.

Je ne veux pas d'une copie d'OP.GG.

Je ne veux pas non plus d'un dashboard SaaS générique avec des cartes arrondies et des dégradés violets.

## Exigences de design

- Une véritable direction artistique cohérente.
- Une excellente hiérarchie visuelle.
- Une typographie élégante et lisible.
- Une utilisation maîtrisée des espaces.
- Des animations discrètes mais qualitatives.
- Des transitions naturelles.
- Des visualisations de données esthétiques.
- Des interactions intuitives.
- Un responsive correct.

L'usage principal est desktop. Tu peux donc privilégier cette expérience.

Le mobile doit néanmoins rester utilisable et ne présenter aucun débordement ou contenu coupé.

Ne sacrifie jamais la lisibilité à l'esthétique.

**Je veux une expérience dont on est fier d'ouvrir le site, même lorsqu'on ne vient pas chercher une statistique précise.**

---

# 4\. ROADMAP FONCTIONNELLE V2

Tu disposes d'une liberté de conception, mais les fonctionnalités suivantes constituent la direction souhaitée.

## CHANTIER 1 — Une nouvelle expérience d'accueil

L'accueil actuel doit évoluer.

Je veux que la première page raconte la vie de l'équipe.

Elle pourrait présenter :

- Une identité forte des Étoiles de l'Esport.
- La dernière soirée jouée.
- Un aperçu des résultats récents.
- La forme collective.
- Les matchs marquants récents.
- Les prochaines pistes à explorer.
- Quelques statistiques remarquables.
- Des accès rapides vers les autres espaces.

La page doit avoir une vraie dimension éditoriale.

Évite de simplement juxtaposer des cartes de statistiques.

Je veux que l'utilisateur comprenne immédiatement ce qu'il regarde et découvre naturellement des informations intéressantes.

## CHANTIER 2 — Enrichissement de la collecte des données

C'est une évolution structurante.

Actuellement, le projet dispose notamment :

- De 190 matchs en base.
- De 58 matchs joués à cinq.
- Des données détaillées conservées dans `raw_json`.
- De données individuelles déjà disponibles dans les matchs.

Je veux explorer et mettre en place une collecte plus large.

### Parties individuelles

Il faut étudier et intégrer, si les API le permettent :

- Les parties classées Solo/Duo de chacun des cinq joueurs.
- Les parties classées Flex de chacun des cinq joueurs.
- Les parties individuelles même lorsqu'elles ne sont pas jouées ensemble.

Les modes non compétitifs ne sont pas recherchés.

Pas d'ARAM, de parties personnalisées ou de modes non classés.

### Séparation des données

Il est absolument indispensable de conserver deux périmètres :

**Périmètre collectif :**

- Uniquement les matchs Flex auxquels participent les cinq joueurs.
- Conservation des règles statistiques actuelles.
- Aucun mélange avec les parties individuelles ou incomplètes.

**Périmètre individuel :**

- Historique classé personnel.
- Solo/Duo et Flex.
- Statistiques personnelles.
- Évolution des champions joués.
- Progression dans le temps.

Un match joué à trois ne doit jamais entrer dans les statistiques de l'équipe à cinq.

### Rang et progression

Je souhaite également récupérer les informations de classement :

- Rang Solo/Duo.
- Rang Flex.
- Division.
- LP.
- Éventuellement les changements au cours du temps.

Attention : l'API ne fournit pas nécessairement un historique complet des rangs.

Mets en place un mécanisme de snapshots périodiques pour enregistrer les rangs à partir de la V2.

Ne fabrique pas de données historiques inexistantes.

### Patchs et saisons

Chaque match doit pouvoir être associé à son patch et à sa période de jeu.

Je veux pouvoir analyser les évolutions par :

- Saison.
- Patch.
- Période personnalisée.

Les données historiques doivent rester consultables même après les mises à jour de contenu de Riot.

### Timelines

Étudie l'exploitation des timelines Match-V5.

Je ne veux pas nécessairement stocker toutes les timelines.

Privilégie une stratégie raisonnée :

- Récupération des timelines des matchs réellement intéressants.
- Extraction des événements pertinents.
- Conservation des données utiles.
- Évitement d'une inflation inutile de la base.

Les timelines doivent permettre de raconter certains matchs : retournements de situation, événements importants, objectifs et moments marquants.

Avant toute extension, vérifie la documentation officielle et les limites actuelles des endpoints Riot.

Ne suppose pas que les possibilités historiques ou les champs disponibles sont identiques pour toutes les versions.

### Fiabilité de la collecte

La collecte doit rester :

- Incrémentale.
- Reprenable après interruption.
- Respectueuse des rate limits.
- Idempotente.
- Testée.
- Compatible avec les données déjà présentes.

Prévois une migration de données sûre.

Ne détruis jamais la base existante pour repartir de zéro.

## CHANTIER 3 — Statistiques intelligentes

Je veux transformer les données en informations réellement utiles.

### Statistiques collectives

Conserve et enrichis :

- Winrate collectif.
- Forme récente.
- Séries.
- KDA collectif.
- Durées des parties.
- Résultats par champion.
- Résultats par composition.
- Résultats par rôle.
- Objectifs.
- Évolutions par patch et saison.

Ajoute éventuellement :

- Champions les plus utilisés par l'équipe.
- Picks récurrents.
- Bans récurrents.
- Associations de champions.
- Compositions les plus jouées.
- Tendances de draft.
- Analyse des conditions de victoire.

### Statistiques individuelles

Chaque joueur doit avoir un espace personnel.

Il pourrait contenir :

- Son historique de parties classées.
- Son évolution de rang.
- Son pool de champions.
- Ses champions les plus joués.
- Ses statistiques par champion.
- Ses statistiques par rôle.
- Ses évolutions dans le temps.
- Ses records personnels.
- Ses habitudes de jeu.

La présentation doit rester positive et non compétitive.

Ne jamais présenter les cinq profils comme un classement.

### Insights

Je veux introduire une véritable notion de découverte.

Exemples :

- « Nous avons remporté 7 de nos 9 dernières parties avec cette composition. »
- « Ce champion est devenu l'un des picks les plus fréquents de l'équipe depuis le patch X. »
- « Nos meilleures parties collectives sont généralement celles où nous prenons rapidement le premier objectif. »
- « Ce joueur a considérablement élargi son pool de champions cette saison. »

Ces phrases sont des exemples de présentation, pas des conclusions prédéterminées.

Les insights doivent être produits à partir de règles déterministes et de données vérifiables.

Chaque insight doit :

- Avoir une source identifiable.
- Afficher son échantillon.
- Respecter des seuils de pertinence.
- Être suffisamment intéressant pour mériter sa place.
- Être présenté avec prudence lorsque l'échantillon est faible.

Ne transforme pas une corrélation en causalité.

Ne cherche pas à afficher un insight sur chaque page si les données ne le justifient pas.

**La qualité prime sur la quantité.**

## CHANTIER 4 — Laboratoire de draft

Je souhaite que tu conçoives un espace dédié à la préparation des compositions.

C'est une des fonctionnalités prioritaires de la V2.

Imagine un espace permettant de :

1. Choisir les cinq joueurs.
2. Attribuer les rôles.
3. Sélectionner des champions.
4. Explorer les pools personnels.
5. Consulter les historiques des picks.
6. Voir les statistiques disponibles.
7. Explorer des associations.
8. Comparer plusieurs compositions.

### Informations intéressantes

Pour un champion envisagé :

- Nombre de parties jouées.
- Nombre de victoires.
- Winrate avec taille d'échantillon.
- Dernière utilisation.
- Rôle habituel.
- Éventuelles associations avec les autres picks.

### Suggestions

Le système peut proposer :

- Des champions familiers.
- Des champions peu explorés.
- Des compositions déjà testées.
- Des associations intéressantes.

Mais attention :

Une suggestion ne doit pas être présentée comme une recommandation statistiquement validée si les données sont insuffisantes.

Il faut distinguer :

- Historique observé.
- Synergie observée.
- Synergie théorique.
- Suggestion exploratoire.

L'objectif est de donner des idées, pas de dicter les picks.

### Expérience utilisateur

Je veux une interface agréable, interactive et visuelle.

La sélection des champions doit être fluide.

Les compositions doivent être lisibles.

Les rôles doivent être clairement identifiés.

Ne construis pas un outil excessivement complexe : cinq amis doivent pouvoir l'utiliser sans formation.

## CHANTIER 5 — Mémoire et histoire de l'équipe

C'est la dimension émotionnelle du projet.

Je veux réintroduire intelligemment les idées de la spécification v0.2.

### Chronologie

Construis une chronologie des soirées et des matchs.

L'utilisateur doit pouvoir parcourir l'histoire de l'équipe.

### Constellation

La constellation doit devenir un véritable élément de navigation et de représentation.

Imagine que :

- Chaque soirée importante soit une étoile.
- Les matchs soient représentés comme des événements associés.
- Les périodes de jeu forment des constellations.
- Les saisons possèdent leur propre identité.

Je te laisse imaginer une visualisation élégante, originale et réellement utile.

Ne construis pas une animation coûteuse qui n'apporte rien.

### Matchs marquants

Identifie automatiquement les événements remarquables :

- Victoires particulièrement marquantes.
- Séries.
- Retournements.
- Multikills.
- Records collectifs.
- Parties exceptionnelles.

Chaque événement doit pouvoir renvoyer vers le match correspondant.

### Pages de match

Chaque match doit disposer d'une URL permanente.

La page doit raconter la partie :

- Résultat.
- Composition.
- Statistiques.
- Champions.
- Événements intéressants.
- Objectifs.
- Timeline lorsque disponible.
- Liens externes pertinents.

L'expérience doit être plus riche qu'une simple fenêtre modale.

### Saisons

Prévois des regroupements temporels cohérents.

Un utilisateur doit pouvoir comprendre :

- Comment l'équipe a évolué.
- Quels champions étaient populaires.
- Quelles compositions étaient utilisées.
- Quels ont été les moments marquants.

### Récapitulatif annuel

Imagine un récapitulatif façon Spotify Wrapped, mais pour les Étoiles de l'Esport.

Il pourrait devenir un véritable objet de partage.

Pas besoin d'attendre une année complète pour concevoir son architecture.

## CHANTIER 6 — Partage et automatisation

Je souhaite :

- Des URLs partageables.
- Des images Open Graph personnalisées.
- Des images de récapitulatif.
- Des récapitulatifs de soirée.
- Une intégration Discord facultative par webhook.
- Une synchronisation automatique.
- Un indicateur de fraîcheur des données.

Le webhook doit être désactivé par défaut en l'absence de configuration.

Aucun secret ne doit être exposé côté client.

Le partage doit être facultatif.

---

# 5\. ARCHITECTURE ET CONTRAINTES

Tu ne dois pas réinventer le projet sans raison.

La base actuelle est saine :

- Astro SSR.
- SQLite.
- SQL brut.
- Tailwind CSS v4.
- Vitest.
- Architecture simple.
- Déploiement prévu sur Railway.

Conserve cette architecture tant qu'elle répond aux besoins.

Pas de migration vers Next.js. Pas de microservices. Pas d'ORM simplement pour moderniser. Pas de nouvelle infrastructure disproportionnée.

Tu peux réorganiser les composants, les services, les modèles de données et les routes si cela permet une meilleure architecture.

Mais toute évolution doit être justifiée.

### Données

- Préserver les données historiques.
- Prévoir des migrations versionnées.
- Séparer les agrégations individuelles et collectives.
- Éviter les calculs dupliqués.
- Conserver la validation des données entrantes.
- Maintenir des tests sur les agrégations.

### Sécurité et simplicité

Le site est destiné à cinq amis.

Il doit rester en lecture seule côté utilisateurs.

Pas de comptes. Pas d'authentification. Pas de commentaires. Pas de notes éditables. Pas de gestion de profils. Pas de back-office complexe.

### Riot et assets

Vérifie les règles actuelles d'utilisation des API et des assets Riot.

La clé de production existe déjà : ne bloque pas le projet sur ce sujet.

En revanche :

- Ne publie aucun secret.
- Respecte les rate limits.
- Vérifie les licences des polices.
- Privilégie Data Dragon et les ressources dont l'utilisation est autorisée.
- Préserve les mentions légales requises.

Références officielles :

- [https://developer.riotgames.com/apis](<https://developer.riotgames.com/apis>)
- [https://developer.riotgames.com/docs/lol](<https://developer.riotgames.com/docs/lol>)
- [https://developer.riotgames.com/docs/portal](<https://developer.riotgames.com/docs/portal>)

---

# 6\. STRATÉGIE DE RÉALISATION

Je ne veux pas que tu développes toutes les fonctionnalités dans le désordre.

Je veux une véritable roadmap de réalisation, avec des étapes cohérentes.

Tu es libre de modifier l'ordre si tu identifies une dépendance technique ou produit importante.

Voici l'ordre initial souhaité.

### V2.0 — Nouvelle identité et expérience

Objectif : faire de la V2 un produit visuellement et fonctionnellement cohérent.

- Nouvelle direction artistique.
- Nouvelle navigation.
- Refonte de l'accueil.
- Responsive propre.
- Réorganisation des pages.
- Préservation des fonctionnalités actuelles.
- Correction des défauts UX existants.

### V2.1 — Données enrichies

Objectif : construire un socle de données permettant les nouvelles expériences.

- Collecte Solo/Duo.
- Collecte Flex individuelle.
- Séparation des périmètres statistiques.
- Données de rang.
- Snapshots historiques.
- Association des patchs.
- Timelines ciblées.
- Migration et tests.

### V2.2 — Intelligence statistique

Objectif : transformer les données en informations intéressantes.

- Pages individuelles.
- Statistiques enrichies.
- Évolutions temporelles.
- Statistiques par patch.
- Insights collectifs.
- Records.
- Comparaisons personnelles dans le temps.

### V2.3 — Draft Lab

Objectif : créer le premier véritable outil interactif du produit.

- Sélection des joueurs.
- Sélection des rôles.
- Sélection des champions.
- Pools individuels.
- Historique des picks.
- Compositions.
- Suggestions.
- Analyse des synergies.

### V2.4 — Mémoire des Étoiles

Objectif : rendre le produit mémorable.

- Chronologie.
- Constellation.
- Matchs marquants.
- Pages de match.
- Saisons.
- Récapitulatif annuel.
- Cartes graphiques partageables.

### V2.5 — Automatisation

Objectif : rendre l'expérience autonome.

- Images Open Graph.
- Récapitulatifs automatiques.
- Webhook Discord facultatif.
- Synchronisation robuste.
- Surveillance de l'ingestion.
- Sauvegardes vérifiées.

Tu peux fusionner certaines versions ou modifier leur ordre si c'est pertinent.

Je préfère une réalisation cohérente à un respect artificiel des numéros de version.

---

# 7\. EXIGENCES DE QUALITÉ

Je ne veux pas d'une V2 qui multiplie les fonctionnalités au détriment de la qualité.

Chaque fonctionnalité livrée doit être réellement terminée.

Cela implique :

- Interface finalisée.
- États vides pertinents.
- Gestion des erreurs.
- Données cohérentes.
- Tests.
- Navigation fonctionnelle.
- Accessibilité.
- Performances raisonnables.
- Documentation mise à jour.

Les fonctionnalités non configurées doivent rester propres et compréhensibles.

Ne présente jamais des données simulées comme des données réelles.

Ne remplis jamais une page avec des chiffres inventés simplement pour lui donner l'air complète.

Lorsque les données sont insuffisantes, explique-le élégamment.

Les règles statistiques actuelles doivent être conservées et étendues avec prudence.

---

# 8\. TA LIBERTÉ CRÉATIVE

Je t'ai donné une direction produit assez détaillée.

Mais je ne veux pas brider ta créativité.

Tu peux :

- Imaginer des fonctionnalités auxquelles je n'ai pas pensé.
- Réinterpréter la constellation.
- Concevoir de nouvelles visualisations.
- Réinventer la navigation.
- Proposer des interactions originales.
- Créer des éléments graphiques propres à l'équipe.
- Trouver des manières inattendues de raconter les données.

Tu dois néanmoins appliquer trois filtres :

1. Est-ce utile aux cinq joueurs ?
2. Est-ce cohérent avec l'identité du produit ?
3. Est-ce suffisamment intéressant pour justifier sa complexité ?

Si une idée ne passe pas ces filtres, abandonne-la.

Ne cherche pas à intégrer de l'IA, de la gamification artificielle ou des fonctionnalités sociales simplement parce qu'elles sont à la mode.

---

# 9\. MÉTHODE DE TRAVAIL

Cette mission est la dernière intervention de notre processus de conception.

Tu n'as pas besoin de demander une validation intermédiaire.

Tu dois prendre les décisions nécessaires à partir des informations disponibles.

### Étape 1 — Reprendre connaissance du dépôt

Avant de coder :

- Vérifie l'état actuel du projet.
- Lis la documentation pertinente.
- Vérifie les fonctionnalités existantes.
- Identifie les éventuels écarts avec le rapport d'audit.
- Examine les données réellement disponibles.
- Vérifie les API actuelles.

Le rapport d'audit est une source d'information, pas une vérité absolue.

### Étape 2 — Formaliser la roadmap

Définis les dépendances entre fonctionnalités.

Identifie les évolutions de base de données nécessaires.

Sépare les fonctionnalités essentielles des fonctionnalités facultatives.

### Étape 3 — Concevoir

Établis une architecture UX cohérente.

Pense le parcours global avant de développer chaque page.

Définis les composants et les conventions graphiques.

### Étape 4 — Développer

Réalise les évolutions par étapes cohérentes.

Ne te contente pas de modifier la page d'accueil.

Le résultat doit être une véritable V2.

### Étape 5 — Tester

Exécute :

- Les tests existants.
- Les nouveaux tests.
- Le type checking.
- Le build de production.
- Les vérifications des migrations.
- Les tests des parcours principaux.

Lance également le site en local et inspecte visuellement les pages.

Vérifie notamment que les nouvelles fonctionnalités fonctionnent avec les données réelles de la base.

### Étape 6 — Finaliser

Mets à jour la documentation.

Explique les nouvelles fonctionnalités.

Documente les éventuelles variables d'environnement supplémentaires.

Documente les opérations de maintenance.

Ne déploie pas en production sans autorisation explicite.

---

# 10\. LIVRABLE FINAL

Je veux à la fin :

1. Une V2 fonctionnelle dans le dépôt.
2. Une nouvelle expérience graphique cohérente.
3. Les nouvelles fonctionnalités réellement implémentées.
4. Les migrations de base de données nécessaires.
5. Les tests associés.
6. Une documentation actualisée.
7. Une roadmap indiquant ce qui est terminé et ce qui reste à faire.
8. Une liste des éventuels arbitrages ou limitations.

Dans ton rapport final, explique notamment :

- Ce que tu as changé.
- Ce que tu as conservé.
- Les fonctionnalités nouvelles.
- Les choix graphiques.
- Les évolutions techniques.
- Les nouvelles données collectées.
- Les fonctionnalités qui nécessitent une configuration extérieure.
- Les éventuelles fonctionnalités reportées.
- Les risques ou limites restantes.

Fournis également une description des principaux parcours utilisateurs de la V2.

---

# 11\. LE DERNIER MOT

Je veux que tu comprennes quelque chose.

Ce projet n'a pas vocation à devenir une plateforme impressionnante techniquement.

C'est un projet fait pour cinq amis.

Il doit donner envie de regarder les anciennes parties, de découvrir des choses sur son équipe, de préparer une prochaine soirée et de se rappeler de bons moments.

Il doit être suffisamment beau pour donner envie de l'ouvrir, suffisamment intelligent pour apprendre quelque chose et suffisamment simple pour ne jamais devenir une contrainte.

Je veux que chaque joueur puisse ouvrir le site et se dire :

« Ah ouais, c'est vraiment notre équipe. »

Je veux que les statistiques aient du sens.

Je veux que les souvenirs aient une place.

Je veux que la préparation soit amusante.

Je veux une vraie identité.

**Ne construis pas un meilleur tracker League of Legends. Construis le quartier général des Étoiles de l'Esport.**

Et n'oublie pas :

**Fait à cinq, pour les cinq. ✦**

## 5. Mon dernier conseil avant de lancer l'agent

Je lui laisserais une vraie liberté sur la direction artistique, mais je serais particulièrement exigeant sur deux choses :

1. La cohérence de l'expérience. Je ne veux pas six fonctionnalités indépendantes qui semblent avoir été développées par six personnes différentes. Il faut un produit avec une identité, une navigation et une logique communes.
2. La profondeur plutôt que la quantité. Un Draft Lab exceptionnel, une belle page de match et une page d'accueil vivante valent mieux que quinze fonctionnalités moyennes.

Et je lui imposerais une petite règle supplémentaire : ne pas confondre une roadmap terminée et une application terminée. Si les données réelles ne permettent pas encore de remplir correctement une fonctionnalité, il doit le signaler et la traiter honnêtement.

Ma vision finale : un mélange entre un carnet de bord, un laboratoire de stratégie et un petit musée vivant de cinq joueurs.

C'est cette direction que je choisirais pour etoiles.win. ✦