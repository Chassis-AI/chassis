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

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  processing: join(DATA, "processing"),
  processed: join(DATA, "processed"),
  errors: join(DATA, "erreurs"),
  outbox: join(DATA, "outbox"),
};
const POLL_MS = 2000;
const LOCK = join(DATA, "daemon.lock");

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

/**
 * Revendique un fichier en le déplaçant atomiquement vers processing/.
 * Si un autre processus l'a pris en premier, retourne null — jamais d'erreur.
 */
function claim(dir: string, file: string): string | null {
  const claimed = join(DIRS.processing, `${process.pid}-${file}`);
  try {
    renameSync(join(dir, file), claimed);
    return claimed;
  } catch {
    return null;
  }
}

function release(claimedPath: string, destDir: string, file: string): void {
  try {
    renameSync(claimedPath, join(destDir, file));
  } catch {
    /* le résultat est déjà persisté ; le déplacement est cosmétique */
  }
}

async function main(): Promise<void> {
  for (const dir of Object.values(DIRS)) mkdirSync(dir, { recursive: true });

  // Verrou d'instance unique : deux daemons sur le même data/ = interdit.
  if (existsSync(LOCK)) {
    const pid = Number(readFileSync(LOCK, "utf8"));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      /* pid mort → verrou périmé */
    }
    if (alive) {
      console.error(`Un daemon tourne déjà (pid ${pid}, ${LOCK}). Arrêt.`);
      process.exit(1);
    }
    rmSync(LOCK);
  }
  writeFileSync(LOCK, String(process.pid));
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      rmSync(LOCK, { force: true });
      process.exit(0);
    });
  }

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
      const claimed = claim(DIRS.inbox, file);
      if (!claimed) continue; // pris par un autre processus
      try {
        const dossier = parseDossier(readFileSync(claimed, "utf8"));
        const { persistedId, result } = await processDossier(runtime, store, instanceId, dossier);
        log(
          `■ ${file} → ${persistedId} · ${result.disposition} · verdict ${result.verdict?.outcome ?? "—"} · mémorisé ${result.memorized ? "oui" : "non"}`,
        );
        release(claimed, DIRS.processed, file);
      } catch (err) {
        log(`✕ ${file} : ${err instanceof Error ? err.message : String(err)}`);
        release(claimed, DIRS.errors, file);
      }
    }
    for (const file of takeFiles(DIRS.settlements)) {
      const claimed = claim(DIRS.settlements, file);
      if (!claimed) continue;
      try {
        const s = parseSettlement(readFileSync(claimed, "utf8"));
        await store.recordSettlement(s.intentionId, s.accepted, s.motive);
        await store.refreshCurve();
        log(`◆ settlement ${s.intentionId} : ${s.accepted ? "accepté" : `REJETÉ (${s.motive ?? "?"})`}`);
        release(claimed, DIRS.processed, file);
      } catch (err) {
        log(`✕ ${file} : ${err instanceof Error ? err.message : String(err)}`);
        release(claimed, DIRS.errors, file);
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
