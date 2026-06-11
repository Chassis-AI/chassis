/**
 * Cœur du daemon : assemblage harness/boucle/mémoire/routeur et
 * traitement d'un dossier ou d'un settlement.
 */

import {
  ChassisLoop,
  DarwinianMemory,
  Harness,
  ModelRouter,
  type CalibrationCase,
  type Category,
  type Intention,
  type LoopResult,
  type MemoryStore,
  type MemoryToken,
} from "@chassis/core";
import { anthropicProvider, hasAnthropicKey, testProvider } from "@chassis/providers";
import { KNOWN_RULE_IDS, RULES } from "./rules.js";
import type { DaemonStore, QueuedIntention } from "./store.js";
import type { DossierFile, HistoryFile } from "./types.js";

/**
 * Intercepte les écritures mémoire de la boucle : le daemon les persiste
 * lui-même avec la provenance réelle (uuid du verdict en base). La lecture
 * (recall) reste branchée sur le store sous-jacent.
 */
export class CaptureMemoryStore implements MemoryStore {
  private pending: MemoryToken[] = [];
  constructor(private readonly inner: MemoryStore) {}

  async put(token: MemoryToken): Promise<void> {
    this.pending.push(token);
  }
  async revoke(tokenId: string): Promise<void> {
    await this.inner.revoke(tokenId);
  }
  async recall(instanceId: string, query: string, limit?: number): Promise<MemoryToken[]> {
    return this.inner.recall(instanceId, query, limit);
  }
  async count(instanceId: string): Promise<number> {
    return this.inner.count(instanceId);
  }
  drain(): MemoryToken[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }
}

export interface DaemonRuntime {
  harness: Harness;
  loop: ChassisLoop;
  capture: CaptureMemoryStore;
  engines: string[];
}

/** Répondeur hors-ligne du provider de test (mêmes règles v0 que le harness). */
function offlineResponder(prompt: string): string {
  const raw = prompt.split("<<DOSSIER>>")[1]?.split("<</DOSSIER>>")[0] ?? "{}";
  try {
    const p = JSON.parse(raw) as {
      salaireBase?: number;
      primes?: number;
      maintienFin?: string;
      subrogationFin?: string;
    };
    const prop: Record<string, unknown> = {
      assiette: (p.salaireBase ?? 0) + (p.primes ?? 0),
    };
    if (p.maintienFin) {
      prop.maintienFin =
        p.subrogationFin && p.maintienFin > p.subrogationFin ? p.subrogationFin : p.maintienFin;
    }
    return JSON.stringify(prop);
  } catch {
    return "{}";
  }
}

async function generate(int: Intention, recalled: string[]) {
  const prompt = [
    "Tu prépares une proposition de correction pour un dossier de paie.",
    "Mémoire validée applicable :",
    ...(recalled.length ? recalled.map((r) => `- ${r}`) : ["- (aucune)"]),
    `Dossier : <<DOSSIER>>${JSON.stringify(int.payload)}<</DOSSIER>>`,
    'Réponds UNIQUEMENT avec un JSON {"assiette": number, "maintienFin"?: "YYYY-MM-DD"}.',
    "Règles : l'assiette inclut les primes ; le maintien est borné à la subrogation.",
  ].join("\n");
  return { prompt }; // la sortie du moteur devient le candidat
}

export async function buildRuntime(
  store: DaemonStore,
  history: HistoryFile[],
): Promise<DaemonRuntime> {
  const harness = new Harness({ reliabilityGate: 0.85 });
  for (const rule of RULES) harness.registerRule(rule);

  const cases: CalibrationCase[] = history.map((h, i) => ({
    intention: {
      id: `hist_${i}`,
      instanceId: "calibration",
      categoryId: "calibration",
      title: h.title,
      payload: h.payload,
      criterion: { kind: "institutional", ruleIds: h.ruleIds, description: "historique" },
      status: "settled",
      createdAt: new Date().toISOString(),
    },
    candidate: {
      id: `hist_cd_${i}`,
      intentionId: `hist_${i}`,
      content: JSON.stringify(h.proposition),
      producedBy: "historique",
      costUsd: 0,
      latencyMs: 0,
    },
    actualAccepted: h.accepted,
  }));
  await harness.calibrate(cases);

  const capture = new CaptureMemoryStore(store.memoryStore());
  const memory = new DarwinianMemory(capture);

  const router = new ModelRouter();
  const engines: string[] = [];
  router.register(testProvider(offlineResponder, { id: "test:paie-v0", tier: 2 }));
  engines.push("test:paie-v0");
  if (hasAnthropicKey()) {
    router.register(anthropicProvider("claude-opus-4-8"));
    engines.push("anthropic:claude-opus-4-8");
  }

  const loop = new ChassisLoop(harness, memory, router, generate);
  return { harness, loop, capture, engines };
}

/** Traite une intention déposée via le cockpit (file en base, déjà revendiquée). */
export async function processQueued(
  runtime: DaemonRuntime,
  store: DaemonStore,
  instanceId: string,
  queued: QueuedIntention,
): Promise<LoopResult> {
  const intention: Intention = {
    id: queued.id,
    instanceId,
    categoryId: queued.categoryId,
    title: queued.title,
    payload: queued.payload,
    criterion: queued.criterion,
    status: "processing",
    createdAt: new Date().toISOString(),
  };
  const category: Category = {
    id: queued.categoryId,
    instanceId,
    label: queued.categoryLabel,
    autonomy: queued.autonomy,
    autonomyThreshold: queued.autonomyThreshold,
  };
  const result = await runtime.loop.run(intention, category);
  await store.persistResult(queued.id, result, runtime.capture.drain());
  await store.refreshCurve();
  return result;
}

export async function processDossier(
  runtime: DaemonRuntime,
  store: DaemonStore,
  instanceId: string,
  dossier: DossierFile,
): Promise<{ persistedId: string; result: LoopResult }> {
  const unknown = (dossier.ruleIds ?? []).filter((r) => !KNOWN_RULE_IDS.has(r));
  if (unknown.length > 0) {
    throw new Error(`Règles inconnues du harness : ${unknown.join(", ")}`);
  }

  const categoryId = await store.ensureCategory(dossier.category);
  const intention: Intention = {
    id: "pending",
    instanceId,
    categoryId,
    title: dossier.title,
    payload: dossier.payload,
    criterion:
      dossier.ruleIds && dossier.ruleIds.length > 0
        ? {
            kind: "institutional",
            ruleIds: dossier.ruleIds,
            description: `Règles : ${dossier.ruleIds.join(", ")}`,
          }
        : null,
    status: "queued",
    createdAt: new Date().toISOString(),
  };

  const persistedId = await store.createIntention(intention, categoryId);
  const category: Category = {
    id: categoryId,
    instanceId,
    label: dossier.category,
    autonomy: "copilot",
    autonomyThreshold: 0.98,
  };

  const result = await runtime.loop.run({ ...intention, id: persistedId }, category);
  await store.persistResult(persistedId, result, runtime.capture.drain());
  await store.refreshCurve();
  return { persistedId, result };
}
