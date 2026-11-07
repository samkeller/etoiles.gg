# Spec produit — etoiles.gg v0.2

Dashboard analytique pour « Les Étoiles de l'Esport » — équipe de 5 en classé flexible.

---

## 1. Le produit en une phrase

Une page unique, belle et vivante, qui raconte l'histoire de notre équipe : nos compos gagnantes, nos champions fétiches, nos synergies — alimentée automatiquement par l'API Riot.

**Principe directeur** : peu de données (≈300 matchs), donc zéro compromis sur la qualité visuelle et interactive. Chaque écran doit être digne d'un site de studio créatif, pas d'un back-office.

---

## 2. Règles produit fondamentales

1. **Les stats cœur = les matchs joués à 5.** Toute métrique principale (winrate global, par champion, synergies, timeline) ne compte QUE les matchs où les 5 joueurs de l'équipe sont présents dans la même partie. C'est le contrat central du produit.
2. Les matchs « partiels » (≥ 2 joueurs de l'équipe) peuvent exister, mais **détachés visuellement et structurellement** : section séparée clairement étiquetée « matchs partiels », jamais mélangés dans les stats d'équipe. Par défaut ils sont masqués.
3. Lecture seule : GET uniquement, pas d'auth, pas de formulaire.
4. La seule écriture de tout le système : le batch d'ingestion quotidien (plus le CLI manuel).

---

## 3. Stack — volontairement minimale

Un seul package, pas de monorepo.

| | Choix |
|---|---|
| Framework | **Astro** (site statique) + **Preact** pour les îlots interactifs |
| API | **Routes API Astro (SSR endpoint files)** — Astro sert `/api/*.json` nativement, pas besoin de Fastify ni de serveur séparé |
| DB | **SQLite**, driver `better-sqlite3`, requêtes SQL brutes (pas d'ORM — 6 tables, 10 requêtes, un ORM ne nous apporte rien) |
| Migration | Un simple fichier `schema.sql` appliqué au boot si la DB n'existe pas |
| Cron | **node-cron** lancé dans un hook Astro, plus CLI `npm run ingest` |
| Styling | Tailwind CSS v4 |
| Animations | Motion (framer-motion pour Preact) + transitions Astro view transitions |
| Validation | Zod (réponses Riot uniquement) |
| Tests | Vitest — parsing Riot + requêtes SQL sur fixtures |
| Déploiement | Railway, volume persistant pour le .sqlite |

```
etoiles.gg/
├── src/
│   ├── pages/index.astro        # la one-page
│   ├── pages/api/*.json.ts      # endpoints GET
│   ├── lib/riot.ts              # client API Riot (fetch + rate limit)
│   ├── lib/db.ts                # schema + accès sqlite
│   ├── lib/ingest.ts            # batch quotidien / CLI
│   ├── components/*.astro       # sections de la page
│   └── islands/*.tsx            # îlots Preact (synergie picker, graphs animés)
├── schema.sql
└── fixtures/                    # réponses Riot anonymisées pour tests
```

Pourquoi ça allège : le serveur API disparaît (Astro endpoints), l'ORM disparaît (SQL brut), le monorepo disparaît (un seul package). Reste exactement ce qui est nécessaire.

---

## 4. Données (SQLite, 4 tables)

```sql
players (
  puuid TEXT PRIMARY KEY, game_name TEXT, tag_line TEXT
)

matches (
  match_id TEXT PRIMARY KEY,
  game_start_ts INTEGER,
  duration_s INTEGER,
  raw_json TEXT              -- snapshot complet, évite re-fetch
)

participants (               -- uniquement nos 5 joueurs
  match_id TEXT, puuid TEXT,
  champion TEXT, role TEXT,
  kills INT, deaths INT, assists INT, gold INT, cs INT, vision INT,
  win INT,
  lineup_size INT            -- 5 = full team, sinon nb de coéquipiers présents
)

ingest_runs (started_at INT, new_matches INT, status TEXT)
```

Notes :
- Seuls les participants **de notre équipe** sont insérés (les adversaires nous importent peu) ; le json brut garde le reste si besoin futur.
- `lineup_size` porte la règle full-team vs partiel : les requêtes stats filtrent `WHERE lineup_size = 5`.
- Pas de tables d'agrégats : GROUP BY à la volée sur ~300 lignes, instantané.

---

## 5. Ingestion

- Résolution Riot ID → PUUID : une fois, via account-v1 (hardcodés en config)
- Liste des matchs par joueur : `match-v5 /by-puuid/{puuid}/ids?queue=440` paginé
- Nouveaux matchs (absents de la table, intersection des listes) : fetch détail → insert participants
- Idempotent (INSERT OR IGNORE), backoff sur 429 (header Retry-After), ~1 req/100 ms
- **Backfill initial** : les 2 ans d'historique, une passe CLI `npm run ingest -- --backfill`
- Cron quotidien via node-cron + CLI `npm run ingest`
- Table `ingest_runs` → expose "dernière synchro" dans le footer

Secrets : `RIOT_API_KEY` en variable d'environnement uniquement (Railway + `.env` gitignored + `.env.example` versionné). Gitleaks en CI. Aucune donnée sensible en DB.

---

## 6. API GET

Endpoints Astro, réponses JSON pré-agrégées (le front ne calcule rien). Tous filtrés `lineup_size = 5` par défaut, sauf mention contraire.

| Endpoint | Retour |
|---|---|
| `/api/overview.json` | nb de matchs full-team, winrate global, période couverte, série de victoires en cours |
| `/api/champions.json?role=&player=` | winrate, picks, KDA, cs/min par champion |
| `/api/synergies.json?c1=&r1=&c2=&r2=` | winrate du duo c1/r1 + c2/r2 sur les matchs communs |
| `/api/compositions.json` | top N comps exactes (5 champions) par winrate |
| `/api/roles.json` | répartition et winrate par joueur/rôle |
| `/api/timeline.json?bucket=week\|month` | winrate et volume par période |
| `/api/matches.json?lineup=all` | derniers matchs — full-team par défaut, opt-in pour partiels |
| `/api/players.json` | roster |

Conventions : 200 même si données vides (front gère les états vides joliment — cf. §7), 400 param invalide avec message.

---

## 7. UX / Design — le cœur du produit

Ici on prend nos libertés. Références d'ambiance : portfolio de studio de design, sites d'awwwards, la landing d'Arcane.

### Direction artistique
- **Palette** : bleu nuit profond (`#0a1428`, `#12264a`) en fond, or (`#f5c542`, dégradé vers `#ffd700` réservé aux moments de victoire), blanc cassé pour le texte. Accents bleu clair (`#4d9fff`) pour la data neutre.
- **Étoile à 5 branches** = seul glyphe iconographique du site. Déclinée : favicon, curseur de hover, marqueurs de victoire (★ pleine dorée / contour éteinte), separators de sections, particules d'ambiance.
- **Typo** : Space Grotesk (titres, chiffres tabulaires) + Inter (corps).
- Fond sombre, chiffres qui **glow** doucement en or quand le winrate est bon.

### Comportement animé (Motion + view transitions)
- **Hero cinématique** : nuit étoilée générative en canvas (particules-étoiles à 5 branches qui dérivent, légère parallaxe à la souris), le nom de l'équipe en tracking large, compte des matchs et du winrate avec animation de compteur.
- **Scroll storytelling** : chaque section arrive en fade+slide décalés ; les chiffres se "typoscrollent" (compteurs animés à l'entrée dans le viewport).
- **Winrate global** : grande jauge circulaire dorée animée à l'arrivée, trait qui se dessine.
- **Section champions** : grille de cartes avec portrait du champion (Data Dragon CDN de Riot, gratuit et sans clé — `ddragon.leagueofcripts.com/versions/{v}/img/champion/…`), hover = tilt léger + glow ; tri/filtre par rôle avec layout FLIP animé.
- **Synergies** : le moment signature. Deux roues de sélection de champions (drag ou click) + toggles de rôles ; au choix, les deux portraits se rapprochent au centre, une constellation se dessine entre eux (ligne dorée) et le winrate apparaît comme une étoile naissante — plus elle est brillante, meilleur est le duo. Transitions spring.
- **Timeline** : area chart du winrate hebdo dessiné progressivement (path animation), points de victoires marqués d'étoiles dorées.
- **Défaites/partiels** : toujours visuellement "éteints" (gris, désaturé, contours) pour le contraste narratif.

### États vides design
Pas d'espaces gris : "Cette synergie n'a jamais été jouée — deux étoiles attendent de briller ✦✦" avec illustration. Même esprit pour matchs partiels : section repliable, visuellement distincte, caption "matchs hors line-up complète".

### Layout one-page
1. Hero (nuit étoilée + winrate global + compteur de matchs)
2. Les champions (grille triable)
3. Les synergies (constellation interactive)
4. Les comps gagnantes (top compos à 5)
5. Rôles du roster (petits radar charts par joueur)
6. Timeline saison
7. Derniers matchs (liste élégante, étoiles win/lose)
8. Footer : dernière synchro, lien GitHub, petit clin d'œil constellation

Mobile-first : toutes les animations fonctionnent au tap, la constellation devient deux selects + bouton "tracé".

---

## 8. Roadmap

| Phase | Contenu | Est. |
|---|---|---|
| P0 | Scaffold Astro + Tailwind + CI (lint/tests) | 0.5 j |
| P1 | Client Riot + schema.sql + CLI ingest/backfill + tests idempotence | 1 j |
| P2 | Cron node-cron + volume Railway + overview.json | 0.5 j |
| P3 | Tous les endpoints + fixtures | 0.5 j |
| P4 | One-page : hero étoilé, sections data, animations | 2–3 j |
| P5 | Constellation interactive (signature) | 1 j |
| P6 | Polish, mobile, deploy etoiles.gg, README public | 0.5 j |

**Total ≈ 6–7 jours.**

---

## 9. Idées bonus (backlog non priorisé)

- Badge "streak" : constellation qui s'allume progressivement à chaque victoire consécutive
- Comparaison avant/après changement de comp : timeline annotée des shifts de méta de l'équipe
- "Match of the month" : mise en avant narrative d'une partie marquante (comeback, pentakill…)
- Page partagée : og-image dynamique du winrate pour partager le lien Discord avec l'identité visuelle
- Export PNG "carte d'identité de l'équipe" générée depuis les stats
