# @chassis/daemon — le chaînon

`outils du métier → daemon → boucle/harness → Supabase → cockpit`

Processus résident : surveille `data/inbox/`, transforme chaque dossier JSON
déposé en intention, le fait juger par le harness, persiste tout (intention,
candidat, verdict, jetons mémoire, point de courbe). `data/settlements/`
ferme la boucle avec les verdicts institutionnels réels.

## Lancer

```bash
pnpm --filter @chassis/daemon start
# puis, dans un autre terminal :
cp apps/daemon/samples/*.json apps/daemon/data/inbox/
```

- **Sans configuration** → mode **dry-run** : résultats dans `data/outbox/`,
  chaîne complète démontrable hors-ligne (provider de test déterministe).
- **Avec Supabase** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CHASSIS_INSTANCE_ID`) → écrit dans le schéma réel ; le cockpit affiche
  le flux en direct. La clé service_role ne sort jamais du daemon.
- **Avec `ANTHROPIC_API_KEY`** → l'adaptateur Anthropic s'ajoute au routeur
  (sinon provider de test seul).

## Formats

`inbox/*.json` — un dossier :

```json
{
  "title": "DSN mensuelle — client X",
  "category": "Paie standard",
  "payload": { "client": "X", "salaireBase": 42000, "primes": 1800 },
  "ruleIds": ["paie.assiette-primes"]
}
```

Sans `ruleIds` : pas de critère vérifiable → `out_of_scope`, rendu à
l'humain (principe 3). Le système ne bluffe jamais.

`settlements/*.json` — un verdict institutionnel :

```json
{ "intentionId": "<uuid>", "accepted": false, "motive": "assiette" }
```

`history/*.json` — cas de calibration (proposition envoyée + verdict réel).
Sous le seuil de fiabilité (85 %), le daemon tourne en **mode ombre** :
il évalue mais ne propose rien.

## Honnêteté v0

- Les règles (`src/rules.ts`) et l'historique fourni sont des
  **démonstrateurs fictifs et étiquetés comme tels**. Les règles de
  production seront écrites et calibrées sur les dossiers réels du premier
  pilote (principe 9).
- Le connecteur v0 est un dossier surveillé — volontairement minimal ;
  les connecteurs réels (export logiciel de paie, mail) s'extrairont de
  l'usage du pilote.
