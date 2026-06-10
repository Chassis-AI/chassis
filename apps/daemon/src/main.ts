/**
 * Daemon CHASSIS v0 — le chaînon : métier → boucle/harness → cockpit.
 *
 *   pnpm --filter @chassis/daemon start
 *
 * Surveille data/inbox/ : chaque dossier JSON déposé est admis, jugé par
 * le harness, persisté. data/settlements/ ferme la boucle (verdicts réels).
 *
 * Modes :
 *  - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + CHASSIS_INSTANCE_ID définis
 *    → écrit dans le schéma réel, le cockpit affiche le flux en direct.
 *  - sinon → dry-run : résultats JSON dans data/outbox/, chaîne complète
 *    démontrable hors-ligne.
 */

import { mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntime, processDossier } from "./daemon.js";
import { DryRunStore, SupabaseStore, type DaemonStore } from "./store.js";
import { parseDossier, parseHistory, parseSettlement, type HistoryFile } from "./types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.CHASSIS_DATA_DIR ?? join(ROOT, "data");
const DIRS = {
  inbox: join(DATA, "inbox"),
  settlements: join(DATA, "settlements"),
  history: join(DATA, "history"),
  processed: join(DATA, "processed"),
  errors: join(DATA, "erreurs"),
  outbox: join(DATA, "outbox"),
};
const POLL_MS = 2000;

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function loadHistory(): HistoryFile[] {
  try {
    return readdirSync(DIRS.history)
      .filter((f) => f.endsWith(".json"))
      .map((f) => parseHistory(readFileSync(join(DIRS.history, f), "utf8")));
  } catch {
    return [];
  }
}

function takeFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  for (const dir of Object.values(DIRS)) mkdirSync(dir, { recursive: true });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CHASSIS_INSTANCE_ID } = process.env;
  let store: DaemonStore;
  let instanceId: string;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && CHASSIS_INSTANCE_ID) {
    store = new SupabaseStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CHASSIS_INSTANCE_ID);
    instanceId = CHASSIS_INSTANCE_ID;
  } else {
    store = new DryRunStore(DIRS.outbox);
    instanceId = "inst_local";
  }

  const history = loadHistory();
  const runtime = await buildRuntime(store, history);

  log(`CHASSIS daemon v0 — persistance : ${store.label}`);
  log(`Moteurs : ${runtime.engines.join(" + ")}`);
  log(
    `Calibration : ${history.length} cas historiques → fiabilité ${(runtime.harness.currentReliability * 100).toFixed(0)}% · droit de proposer : ${runtime.harness.mayPropose ? "oui" : "NON (mode ombre — déposer des cas dans data/history/)"}`,
  );
  log(`Surveille ${DIRS.inbox} (dossiers) et ${DIRS.settlements} (verdicts réels)…`);

  const tick = async (): Promise<void> => {
    for (const file of takeFiles(DIRS.inbox)) {
      const path = join(DIRS.inbox, file);
      try {
        const dossier = parseDossier(readFileSync(path, "utf8"));
        const { persistedId, result } = await processDossier(runtime, store, instanceId, dossier);
        log(
          `■ ${file} → ${persistedId} · ${result.disposition} · verdict ${result.verdict?.outcome ?? "—"} · mémorisé ${result.memorized ? "oui" : "non"}`,
        );
        renameSync(path, join(DIRS.processed, file));
      } catch (err) {
        log(`✕ ${file} : ${err instanceof Error ? err.message : String(err)}`);
        renameSync(path, join(DIRS.errors, file));
      }
    }
    for (const file of takeFiles(DIRS.settlements)) {
      const path = join(DIRS.settlements, file);
      try {
        const s = parseSettlement(readFileSync(path, "utf8"));
        await store.recordSettlement(s.intentionId, s.accepted, s.motive);
        await store.refreshCurve();
        log(`◆ settlement ${s.intentionId} : ${s.accepted ? "accepté" : `REJETÉ (${s.motive ?? "?"})`}`);
        renameSync(path, join(DIRS.processed, file));
      } catch (err) {
        log(`✕ ${file} : ${err instanceof Error ? err.message : String(err)}`);
        renameSync(path, join(DIRS.errors, file));
      }
    }
  };

  // Boucle de surveillance — séquentielle, un tick à la fois.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
