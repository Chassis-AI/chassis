# Déploiement CHASSIS

> **État (2026-06-10)** : landing + cockpit démo en ligne sur
> https://chassis-pilote.netlify.app (deploy CLI manuel, équipe AgentX,
> site id `5d90193d-5b92-4f8c-952d-fd25964ad71d`).
> GitHub : https://github.com/Chassis-AI/chassis (public, branche main ;
> le remote est épinglé au compte `Chassis-AI` — gh garde ce compte en
> keyring, les autres comptes de la machine ne sont pas utilisés ici).
> Reste : lier le site Netlify au repo (CI auto), créer le projet Supabase
> EU + exécuter `supabase/schema.sql` + variables d'env dans Netlify.

## 1. GitHub

```bash
git add -A && git commit -m "CHASSIS v0.1 — core, cockpit, site, supabase, desktop"
gh repo create chassis --private --source . --push
```

## 2. Netlify (landing + cockpit web)

Le repo contient `netlify.toml` : build automatique (`pnpm -r build` + assemblage),
publication de `dist/` — landing à la racine, cockpit sous `/app/`.

1. netlify.com → *Add new site* → *Import from GitHub* → choisir le repo.
2. Aucun réglage manuel (tout est dans `netlify.toml`).
3. Variables d'environnement (Site settings → Environment) quand Supabase est branché :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## 3. Supabase

1. supabase.com → nouveau projet (région EU de préférence — données métier).
2. SQL Editor → exécuter `supabase/schema.sql` (tables, contrainte de provenance mémoire, RLS).
3. Authentication → activer email (magic link suffit pour le pilote).
4. Récupérer URL + clé anon → Netlify env vars + `.env.local` en dev.

**Note RLS** : les verdicts n'ont aucune policy UPDATE/DELETE — immuables côté client
par construction. Les écritures de la boucle (daemon) utilisent la clé `service_role`,
jamais exposée au front.

## 4. Desktop (Tauri v2)

Prérequis : Rust (`rustup`), puis :

```bash
cd apps/cockpit
pnpm tauri build        # macOS: .dmg · Windows: .msi/.exe (builder sur l'OS cible)
```

Pour signer/distribuer : compte Apple Developer (notarisation macOS) et certificat
de signature Windows — à traiter au moment de la distribution réelle, pas avant.

## 5. CI (optionnel, plus tard)

GitHub Actions : `pnpm -r build` sur PR ; build Tauri matrix (macos-latest,
windows-latest) sur tag. À ajouter quand il y aura un deuxième contributeur.
