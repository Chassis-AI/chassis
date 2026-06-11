/**
 * Boucle de démonstration DANS le navigateur — le vrai moteur
 * (@chassis/core), les mêmes règles v0 que le daemon, un provider
 * déterministe hors-ligne. Un visiteur dépose un dossier et voit le
 * harness juger, sans compte ni backend. Tout est étiqueté démo.
 */

import {
  ChassisLoop,
  DarwinianMemory,
  Harness,
  InMemoryStore,
  ModelRouter,
  type Candidate,
  type Category,
  type HarnessRule,
  type Intention,
  type ModelProvider,
} from "@chassis/core";
import type { UiIntent } from "./data";

export interface DepositInput {
  kind: "dsn" | "ij";
  client: string;
  salaireBase: number;
  primes: number;
  maintienFin?: string;
  subrogationFin?: string;
}

interface PayloadPaie {
  client?: string;
  salaireBase?: number;
  primes?: number;
  maintienFin?: string;
  subrogationFin?: string;
}

function parseProposition(candidate: Candidate): { assiette?: number; maintienFin?: string } | null {
  try {
    const text =
      typeof candidate.content === "string" ? candidate.content : JSON.stringify(candidate.content);
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

/* Mêmes règles v0 que apps/daemon/src/rules.ts — démonstrateurs étiquetés. */
const RULES: HarnessRule[] = [
  {
    id: "paie.assiette-primes",
    version: 2,
    origin: "learned",
    description: "L'assiette de cotisations inclut les primes (rejet appris).",
    evaluate(intention, candidate) {
      const p = intention.payload as PayloadPaie;
      const prop = parseProposition(candidate);
      const attendu = (p.salaireBase ?? 0) + (p.primes ?? 0);
      const ok = prop !== null && prop.assiette === attendu;
      return {
        ruleId: "paie.assiette-primes",
        ruleVersion: 2,
        ok,
        detail: ok
          ? `Assiette ${prop!.assiette} € = base + primes.`
          : `Assiette attendue ${attendu} €, proposée ${prop?.assiette ?? "—"}.`,
      };
    },
  },
  {
    id: "ij.subrogation",
    version: 1,
    origin: "declared",
    description: "Le maintien de salaire ne dépasse pas la période de subrogation.",
    evaluate(intention, candidate) {
      const p = intention.payload as PayloadPaie;
      const prop = parseProposition(candidate);
      const fin = prop?.maintienFin ?? p.maintienFin;
      const ok = Boolean(fin && p.subrogationFin && fin <= p.subrogationFin);
      return {
        ruleId: "ij.subrogation",
        ruleVersion: 1,
        ok,
        detail: ok
          ? `Maintien borné au ${fin} (subrogation jusqu'au ${p.subrogationFin}).`
          : `Maintien jusqu'au ${fin ?? "—"} > subrogation ${p.subrogationFin ?? "—"} — rejet probable.`,
      };
    },
  },
];

/** Provider déterministe : applique la règle d'assiette et borne le maintien. */
const browserProvider: ModelProvider = {
  id: "demo:navigateur",
  costPerMTokUsd: 0,
  typicalLatencyMs: 0,
  tier: 2,
  async complete(prompt: string) {
    const raw = prompt.split("<<DOSSIER>>")[1]?.split("<</DOSSIER>>")[0] ?? "{}";
    const p = JSON.parse(raw) as PayloadPaie;
    const prop: Record<string, unknown> = { assiette: (p.salaireBase ?? 0) + (p.primes ?? 0) };
    if (p.maintienFin) {
      prop.maintienFin =
        p.subrogationFin && p.maintienFin > p.subrogationFin ? p.subrogationFin : p.maintienFin;
    }
    return { text: JSON.stringify(prop), costUsd: 0, latencyMs: 0 };
  },
};

let runtime: { loop: ChassisLoop } | null = null;
let seq = 0;

async function getRuntime(): Promise<{ loop: ChassisLoop }> {
  if (runtime) return runtime;
  const harness = new Harness({ reliabilityGate: 0.85 });
  for (const rule of RULES) harness.registerRule(rule);
  // Calibration de démo : 4 cas fictifs (les mêmes que le daemon).
  const cal = (payload: PayloadPaie, ruleIds: string[], proposition: object, accepted: boolean) => ({
    intention: {
      id: `h${seq++}`,
      instanceId: "demo",
      categoryId: "demo",
      title: "historique fictif",
      payload,
      criterion: { kind: "institutional" as const, ruleIds, description: "" },
      status: "settled" as const,
      createdAt: new Date().toISOString(),
    },
    candidate: {
      id: `hc${seq}`,
      intentionId: `h${seq}`,
      content: JSON.stringify(proposition),
      producedBy: "historique",
      costUsd: 0,
      latencyMs: 0,
    },
    actualAccepted: accepted,
  });
  await harness.calibrate([
    cal({ salaireBase: 30000, primes: 500 }, ["paie.assiette-primes"], { assiette: 30500 }, true),
    cal({ salaireBase: 28000, primes: 900 }, ["paie.assiette-primes"], { assiette: 28000 }, false),
    cal({ maintienFin: "2026-05-10", subrogationFin: "2026-05-20" }, ["ij.subrogation"], { assiette: 0, maintienFin: "2026-05-10" }, true),
    cal({ maintienFin: "2026-05-25", subrogationFin: "2026-05-20" }, ["ij.subrogation"], { assiette: 0, maintienFin: "2026-05-25" }, false),
  ]);
  const memory = new DarwinianMemory(new InMemoryStore());
  const router = new ModelRouter();
  router.register(browserProvider);
  const loop = new ChassisLoop(harness, memory, router, async (int) => ({
    prompt: `Dossier : <<DOSSIER>>${JSON.stringify(int.payload)}<</DOSSIER>>`,
  }));
  runtime = { loop };
  return runtime;
}

export function depositTitle(input: DepositInput): string {
  return input.kind === "dsn"
    ? `DSN — ${input.client}`
    : `Arrêt maladie (IJ) — ${input.client}`;
}

export function depositRuleIds(input: DepositInput): string[] {
  return input.kind === "dsn" ? ["paie.assiette-primes"] : ["ij.subrogation"];
}

export function depositPayload(input: DepositInput): Record<string, unknown> {
  return {
    client: input.client,
    salaireBase: input.salaireBase,
    primes: input.primes,
    ...(input.kind === "ij"
      ? { maintienFin: input.maintienFin, subrogationFin: input.subrogationFin }
      : {}),
  };
}

/** Juge un dossier déposé, entièrement dans le navigateur (mode démo). */
export async function judgeInBrowser(input: DepositInput, categoryLabel: string): Promise<UiIntent> {
  const { loop } = await getRuntime();
  seq += 1;
  const id = `DEP-${String(seq).padStart(3, "0")}`;
  const intention: Intention = {
    id,
    instanceId: "demo",
    categoryId: "demo",
    title: depositTitle(input),
    payload: depositPayload(input),
    criterion: {
      kind: "institutional",
      ruleIds: depositRuleIds(input),
      description: "Règles paie v0 (démo)",
    },
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  const category: Category = {
    id: "demo",
    instanceId: "demo",
    label: categoryLabel,
    autonomy: "copilot",
    autonomyThreshold: 0.98,
  };
  const result = await loop.run(intention, category);
  const stamp =
    result.verdict?.outcome === "passed"
      ? "pass"
      : result.verdict?.outcome === "rejected"
        ? "fail"
        : "hold";
  return {
    id,
    ref: id,
    title: intention.title,
    category: categoryLabel,
    stamp,
    applied: false,
    findings: result.verdict?.findings ?? [],
  };
}
