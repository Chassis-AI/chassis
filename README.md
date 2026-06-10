# CHASSIS_

**Système de travail vérifié.** CHASSIS exécute du travail spécialisé, prouve chaque
résultat avant de le livrer (harness), ne mémorise que le validé (mémoire darwinienne),
et monte en autonomie à la vitesse de la preuve. Facturé à l'unité validée.

> Doctrine complète : [docs/DOCTRINE.md](docs/DOCTRINE.md) ·
> Vision : [docs/VISION.md](docs/VISION.md) ·
> Déploiement : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Structure

```
packages/core/      @chassis/core — harness, boucle 6 temps, mémoire validée, routeur de modèles
packages/providers/ @chassis/providers — adaptateurs moteurs (Anthropic, test) + exemple bout en bout
apps/daemon/        Daemon v0 — inbox surveillée → boucle → persistance (Supabase ou dry-run)
apps/cockpit/       Cockpit (Vite + React) — file d'intentions, verdicts, courbe, autonomie
  src-tauri/        Coque desktop Tauri v2 (macOS .dmg / Windows .msi)
apps/site/          Landing statique (Netlify)
supabase/           schema.sql — tables + RLS (provenance mémoire imposée par contrainte)
scripts/            assemble.mjs — assemble dist/ (landing + cockpit sous /app/)
docs/               doctrine, déploiement
```

## Démarrer

```bash
corepack enable          # pnpm
pnpm install
pnpm dev                 # cockpit sur http://localhost:5173 (mode démo seedé)
pnpm -r build            # core + providers + cockpit
node scripts/assemble.mjs  # produit dist/ déployable

# Le chaînon complet (daemon → boucle → verdicts) :
pnpm --filter @chassis/daemon start            # dry-run sans config
cp apps/daemon/samples/*.json apps/daemon/data/inbox/
```

### Desktop (optionnel — requiert la toolchain Rust)

```bash
cd apps/cockpit
pnpm tauri dev           # fenêtre native
pnpm tauri build         # .dmg / .msi / .exe
```

### Supabase

Créer un projet sur supabase.com puis exécuter `supabase/schema.sql` dans le SQL editor.
Copier `.env.example` → `apps/cockpit/.env.local` avec l'URL et la clé anon.
Sans `.env`, le cockpit tourne en mode démo (données seedées, étiquetées « démo »).

## Le moteur en 30 secondes

```ts
const harness = new Harness({ reliabilityGate: 0.85 });
harness.registerRule(/* règles déclarées + apprises, versionnées */);
await harness.calibrate(historique); // sous le seuil → le système n'a pas le droit de proposer

const memory = new DarwinianMemory(store); // aucune insertion directe : verdicts/settlements uniquement
const router = new ModelRouter();          // moteurs interchangeables (principe 6)
const loop = new ChassisLoop(harness, memory, router, generate);

const result = await loop.run(intention, category); // shadow | copilot | auto — le harness reste la porte
```

## Stack — décision actée

TypeScript partout. Rust/Python rejetés pour la v0.1 (voir DOCTRINE.md, critères de
réouverture inclus). Le seul Rust du repo est la coque Tauri, générée par le framework.
