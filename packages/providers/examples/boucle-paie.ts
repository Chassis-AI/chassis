/**
 * Exemple bout en bout — boucle CHASSIS sur des dossiers FICTIFS de paie.
 *
 *   pnpm --filter @chassis/providers example
 *
 * Sans clé API : tourne sur le provider de test (déterministe, gratuit).
 * Avec ANTHROPIC_API_KEY : enregistre aussi l'adaptateur Anthropic dans le
 * routeur (le moins cher du tiers requis gagne — principe 6).
 *
 * Tout est fictif et étiqueté comme tel. Le but est de montrer le chemin
 * complet : calibration → admission → génération → verdict → mémoire.
 */

import {
  Harness,
  DarwinianMemory,
  InMemoryStore,
  ModelRouter,
  ChassisLoop,
  type CalibrationCase,
  type Candidate,
  type Category,
  type HarnessRule,
  type Intention,
} from "@chassis/core";
import { anthropicProvider, hasAnthropicKey, testProvider } from "../src/index.js";

/* ── Domaine fictif : un dossier de paie ───────────────────────────────── */

interface DossierPaie {
  client: string;
  salaireBase: number;
  primes: number;
  /** Fin du maintien de salaire déclaré (IJ). */
  maintienFin?: string;
  /** Fin de la période de subrogation. */
  subrogationFin?: string;
}

/** Ce que la boucle doit produire : une proposition corrigée. */
interface Proposition {
  assiette: number;
  maintienFin?: string;
}

const MARK = { open: "<<DOSSIER>>", close: "<</DOSSIER>>" };

function parseProposition(candidate: Candidate): Proposition | null {
  try {
    const text =
      typeof candidate.content === "string"
        ? candidate.content
        : JSON.stringify(candidate.content);
    const match = text.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as Proposition) : null;
  } catch {
    return null;
  }
}

/* ── Règles du harness (déclarées + apprise) ───────────────────────────── */

const regleAssiette: HarnessRule = {
  id: "paie.assiette-primes",
  version: 2,
  origin: "learned", // née d'un rejet réel (fictif) : prime exclue de l'assiette
  description: "L'assiette de cotisations inclut les primes (rejet appris).",
  evaluate(intention, candidate) {
    const dossier = intention.payload as DossierPaie;
    const prop = parseProposition(candidate);
    const attendu = dossier.salaireBase + dossier.primes;
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
};

const regleSubrogation: HarnessRule = {
  id: "ij.subrogation",
  version: 1,
  origin: "declared",
  description: "Le maintien de salaire ne dépasse pas la période de subrogation.",
  evaluate(intention, candidate) {
    const dossier = intention.payload as DossierPaie;
    const prop = parseProposition(candidate);
    const fin = prop?.maintienFin ?? dossier.maintienFin;
    const ok = Boolean(fin && dossier.subrogationFin && fin <= dossier.subrogationFin);
    return {
      ruleId: "ij.subrogation",
      ruleVersion: 1,
      ok,
      detail: ok
        ? `Maintien borné au ${fin} (subrogation jusqu'au ${dossier.subrogationFin}).`
        : `Maintien jusqu'au ${fin ?? "—"} > subrogation ${dossier.subrogationFin ?? "—"} — rejet probable.`,
    };
  },
};

/* ── Dossiers fictifs ──────────────────────────────────────────────────── */

function intention(
  id: string,
  title: string,
  payload: DossierPaie | null,
  ruleIds: string[] | null,
): Intention {
  return {
    id,
    instanceId: "inst_demo",
    categoryId: "cat_paie",
    title,
    payload,
    criterion: ruleIds
      ? { kind: "institutional", ruleIds, description: "Règles paie applicables" }
      : null,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
}

const DOSSIERS: Intention[] = [
  intention(
    "FIC-001",
    "DSN mensuelle — Aubrac SARL (fictif)",
    { client: "Aubrac SARL", salaireBase: 42000, primes: 1800 },
    ["paie.assiette-primes"],
  ),
  intention(
    "FIC-002",
    "Arrêt maladie — Hôtel des Brumes (fictif)",
    {
      client: "Hôtel des Brumes",
      salaireBase: 21000,
      primes: 0,
      maintienFin: "2026-06-30",
      subrogationFin: "2026-06-14",
    },
    ["ij.subrogation"],
  ),
  intention(
    "FIC-003",
    "Question juridique : rupture conventionnelle collective (fictif)",
    null,
    null, // pas de critère → hors périmètre par construction (principe 3)
  ),
];

/* ── Générateur de candidats ───────────────────────────────────────────── */
/* Le prompt embarque le dossier + la mémoire rappelée ; la sortie du moteur
   (JSON) devient le candidat — c'est elle que le harness juge. */

async function generate(int: Intention, recalled: string[]) {
  const prompt = [
    "Tu prépares une proposition de correction pour un dossier de paie.",
    "Mémoire validée applicable :",
    ...(recalled.length ? recalled.map((r) => `- ${r}`) : ["- (aucune)"]),
    `Dossier : ${MARK.open}${JSON.stringify(int.payload)}${MARK.close}`,
    'Réponds UNIQUEMENT avec un JSON {"assiette": number, "maintienFin"?: "YYYY-MM-DD"}.',
    "Règles : l'assiette inclut les primes ; le maintien est borné à la subrogation.",
  ].join("\n");
  return { prompt }; // content omis → la sortie du moteur devient le candidat
}

/** Répondeur du provider de test : applique la règle d'assiette mais OUBLIE
 *  de borner la subrogation — pour montrer un verdict "rejected" réel. */
function testResponder(prompt: string): string {
  const raw = prompt.split(MARK.open)[1]?.split(MARK.close)[0] ?? "{}";
  const dossier = JSON.parse(raw) as DossierPaie;
  const proposition: Proposition = {
    assiette: dossier.salaireBase + dossier.primes,
    ...(dossier.maintienFin ? { maintienFin: dossier.maintienFin } : {}),
  };
  return JSON.stringify(proposition);
}

/* ── Assemblage et exécution ───────────────────────────────────────────── */

async function main() {
  const harness = new Harness({ reliabilityGate: 0.85 });
  harness.registerRule(regleAssiette);
  harness.registerRule(regleSubrogation);

  // Calibration sur un historique fictif : verdicts harness vs verdicts réels.
  const histo = (
    id: string,
    payload: DossierPaie,
    ruleIds: string[],
    proposition: Proposition,
    actualAccepted: boolean,
  ): CalibrationCase => ({
    intention: intention(id, `Historique ${id}`, payload, ruleIds),
    candidate: {
      id: `cd_${id}`,
      intentionId: id,
      content: JSON.stringify(proposition),
      producedBy: "historique",
      costUsd: 0,
      latencyMs: 0,
    },
    actualAccepted,
  });
  const reliability = await harness.calibrate([
    histo("H1", { client: "A", salaireBase: 30000, primes: 500 }, ["paie.assiette-primes"], { assiette: 30500 }, true),
    histo("H2", { client: "B", salaireBase: 28000, primes: 900 }, ["paie.assiette-primes"], { assiette: 28000 }, false),
    histo("H3", { client: "C", salaireBase: 25000, primes: 0, maintienFin: "2026-05-10", subrogationFin: "2026-05-20" }, ["ij.subrogation"], { assiette: 25000, maintienFin: "2026-05-10" }, true),
    histo("H4", { client: "D", salaireBase: 26000, primes: 0, maintienFin: "2026-05-25", subrogationFin: "2026-05-20" }, ["ij.subrogation"], { assiette: 26000, maintienFin: "2026-05-25" }, false),
  ]);

  // Mémoire : seedée par un règlement réel (rejet appris), jamais en direct.
  const memory = new DarwinianMemory(new InMemoryStore());
  await memory.admitFromSettlement(
    "inst_demo",
    { intentionId: "H2", accepted: false, motive: "assiette", settledAt: new Date().toISOString() },
    "Aubrac : les primes entrent dans l'assiette de cotisations — rejet appris, règle paie.assiette-primes v2.",
  );

  // Routeur : provider de test toujours ; Anthropic si une clé est présente.
  const router = new ModelRouter();
  router.register(testProvider(testResponder, { id: "test:paie", tier: 2 }));
  if (hasAnthropicKey()) {
    router.register(anthropicProvider("claude-opus-4-8"));
    console.log("Moteurs : test:paie + anthropic:claude-opus-4-8 (clé détectée)");
  } else {
    console.log("Moteurs : test:paie uniquement (pas d'ANTHROPIC_API_KEY)");
  }

  const loop = new ChassisLoop(harness, memory, router, generate);
  const category: Category = {
    id: "cat_paie",
    instanceId: "inst_demo",
    label: "Paie standard",
    autonomy: "copilot",
    autonomyThreshold: 0.98,
  };

  console.log(`Fiabilité du harness (calibration) : ${(reliability * 100).toFixed(0)}%`);
  console.log(`Droit de proposer : ${harness.mayPropose ? "oui" : "non (mode ombre)"}\n`);

  for (const dossier of DOSSIERS) {
    const result = await loop.run(dossier, category);
    console.log(`■ ${dossier.id} — ${dossier.title}`);
    console.log(`  disposition : ${result.disposition} · statut : ${result.intention.status}`);
    if (result.verdict) {
      console.log(`  verdict : ${result.verdict.outcome}`);
      for (const f of result.verdict.findings) {
        console.log(`    ${f.ok ? "✓" : "✕"} ${f.ruleId} — ${f.detail}`);
      }
    }
    if (result.candidate) {
      console.log(
        `  moteur : ${result.candidate.producedBy} · ${result.candidate.latencyMs} ms · $${result.candidate.costUsd.toFixed(6)}`,
      );
    }
    console.log(`  mémorisé : ${result.memorized ? "oui" : "non"}\n`);
  }

  console.log(`Jetons en mémoire (inst_demo) : ${await memory.count("inst_demo")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
