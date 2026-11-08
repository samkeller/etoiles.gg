# Housekeeping

## Interface

- [x] Centraliser le domaine dans `src/lib/site.ts` (`SITE_NAME`), distinct du nom de l'équipe.
- [x] Garder le menu opaque sur toute la largeur de l'écran pendant le défilement
  et dégager les ancres sous le menu.
- [x] Adapter le fond fixe à la taille de l'écran, y compris sur les écrans larges.
- [x] Mettre en cache les détails de match déjà consultés pendant la session, annuler les
  requêtes obsolètes, réinitialiser le scroll et proposer un bouton Réessayer.
- [x] Charger les historiques repliés à l'ouverture, avec liens GET de secours sans JavaScript.
- [x] Rendre la forme récente cliquable avec le dialog existant.
- [x] Afficher les associations et compositions à 4/5 matchs sans aucun bilan de victoire
  ni statistique de performance ; recalculer le seuil après filtrage par rôles.
- [x] Ajouter les sorts d'invocateur et les en-têtes du tableau ; conserver les libellés
  existants (KP, Meilleure partie), sans ajouter de texte explicatif superflu.
- [x] Nettoyer imports inutilisés, IDs dupliqués, calculs de séries collectives retirées,
  casts `any` d'icônes et formules KDA dupliquées.
- [x] Retirer `cdragon-dd`, inutilisé ; conserver Preact et la bibliothèque d'assets Riot.
- [ ] Repenser l'affichage des pages/composants et/ou afficher sur le menu ou le scroll en est.

## Décision bloquée

- [ ] Remplacer le lien de match League of Graphs par OP.GG uniquement si une URL de match
  stable et documentée peut être construite depuis les données Riot. L'exemple actuel
  utilise un identifiant opaque OP.GG : ne pas fabriquer de lien ni le remplacer par
  une page de profil présentée comme un détail de match. League of Graphs reste fonctionnel.

## Données et synchronisation

- [x] Typer les réponses Riot, valider les entrées et borner timeout/retries.
- [x] Paginer le backfill et les collectes incrémentales ; conserver une file durable des
  IDs échoués et des curseurs par joueur, sans perte derrière un timestamp global.
- [x] Écrire match et participants atomiquement ; signaler les runs partiellement échoués.
- [x] Réparer les anciens matchs incomplets sans perdre leurs données si la reprise échoue.
- [x] Partager les validations des lineups entre historique, détail et fiches joueurs.
- [x] Normaliser les aliases champions et réutiliser les données déjà validées.
- [x] Vérifier HTTP, contenu PNG et réponses de profil ; écrire les assets atomiquement
  et retourner un code d'erreur en cas de synchronisation partielle.
- [x] Partager un schéma SQL unique inclus dans le build de production.

## Suite de la roadmap

- [ ] Lot 4 : déploiement, stockage persistant, cron et healthcheck.