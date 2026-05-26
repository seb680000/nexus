# Nexus V2

Reconstruction légère du logiciel Nexus Appels SALC.

## Objectif

Créer une application web légère, maintenable et multi-utilisateurs pour analyser les exports 3CX.

## Fonctionnalités V2.1

- Connexion navigateur pour admin et utilisateurs.
- Rôles : superadmin, admin, manager, user.
- Permissions par vue.
- Import CSV 3CX.
- Analyse immédiate après dépôt.
- KPI principaux : appels reçus, répondus, abandonnés, internes, sortants, premium abandonnés.
- Filtres dynamiques : jour, semaine, mois, trimestre, année.
- Vue client.
- Vue opératrice.
- Détail cliquable par indicateur.
- Base PostgreSQL prête pour Railway, Render, Neon ou Supabase.

## Stack recommandée

- Frontend : React + Vite + TypeScript.
- Graphiques : Recharts.
- Base : PostgreSQL.
- Backend futur : Node.js + Fastify + Prisma.
- Auth future : Better Auth, Clerk ou Auth0.
- Hébergement recommandé : Railway pour démarrer, Render pour stabiliser.

## Commandes locales

```bash
cd v2
npm install
npm run dev
```

## Base de données

Le schéma PostgreSQL est dans :

```txt
v2/db/schema.sql
```

## Déploiement conseillé

### Option simple

Railway :

- 1 service frontend.
- 1 service API ensuite.
- 1 base PostgreSQL.

### Option stable

Render :

- Static Site pour le frontend.
- Web Service pour l'API.
- PostgreSQL managé.

## Note importante

L'ancien `index.html` reste la référence fonctionnelle. La V2 doit reprendre les statistiques mais sans conserver le fichier monolithique.
