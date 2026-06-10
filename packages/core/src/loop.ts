/**
 * La boucle CHASSIS — 6 temps (l'essence conservée de la vision d'origine) :
 * Observation → Génération → Évaluation → Sélection → Application → Mémorisation.
 *
 * S'applique au TRAVAIL produit, jamais au runtime (principe 5).
 * Respecte l'autonomie par catégorie (autonomy slider) :
 *  - shadow  : évalue, n'expose rien.
 *  - copilot : expose verdict + proposition, l'humain décide.
 *  - auto    : applique seul — mais le harness reste la porte.
 */

import { Harness } from "./harness.js";
import { DarwinianMemory } from "./memory.js";
import { ModelRouter } from "./router.js";
import type { Candidate, Category, Intention, Verdict } from "./types.js";

export interface LoopResult {
  intention: Intention;
  candidate: Candidate | null;
  verdict: Verdict | null;
  /** Ce que la boucle a décidé d'en faire. */
  disposition: "shadowed" | "proposed" | "applied" | "returned_to_human";
  memorized: boolean;
}

export interface CandidateGenerator {
  /** `content` peut rester undefined : la sortie du moteur devient alors le candidat. */
  (intention: Intention, recalled: string[]): Promise<{ content?: unknown; prompt: string }>;
}

export class ChassisLoop {
  constructor(
    private readonly harness: Harness,
    private readonly memory: DarwinianMemory,
    private readonly router: ModelRouter,
    private readonly generate: CandidateGenerator,
  ) {}

  async run(intention: Intention, category: Category): Promise<LoopResult> {
    // 0. Pas de preuve, pas de tâche (principe 3).
    if (!intention.criterion) {
      return {
        intention: { ...intention, status: "out_of_scope" },
        candidate: null,
        verdict: null,
        disposition: "returned_to_human",
        memorized: false,
      };
    }

    // 1. Observation — rappel mémoire (jetons validés uniquement, par construction).
    const recalled = await this.memory.recall(intention.instanceId, intention.title);
    const context = recalled.map((t) => t.summary);

    // 2. Génération — via le routeur (moteur = commodité).
    const generated = await this.generate(intention, context);
    const llm = await this.router.complete("generation", generated.prompt);
    const candidate: Candidate = {
      id: `cd_${intention.id}`,
      intentionId: intention.id,
      content: generated.content ?? llm.text,
      producedBy: llm.providerId,
      costUsd: llm.costUsd,
      latencyMs: llm.latencyMs,
    };

    // 3. Évaluation — la seule porte (principe 2).
    const verdict = await this.harness.evaluate(intention, candidate);

    // 4-5. Sélection + application, gouvernées par la calibration et l'autonomie.
    if (!this.harness.mayPropose || category.autonomy === "shadow") {
      return { intention, candidate, verdict, disposition: "shadowed", memorized: false };
    }

    let disposition: LoopResult["disposition"];
    let status: Intention["status"];
    if (verdict.outcome === "passed" && category.autonomy === "auto") {
      disposition = "applied";
      status = "applied";
    } else if (verdict.outcome === "unverifiable") {
      disposition = "returned_to_human";
      status = "out_of_scope";
    } else {
      disposition = "proposed";
      status = verdict.outcome === "passed" ? "verified" : "anomaly";
    }

    // 6. Mémorisation — uniquement si le verdict est passé (la porte).
    let memorized = false;
    if (verdict.outcome === "passed") {
      await this.memory.admitFromVerdict(
        intention.instanceId,
        verdict,
        `${intention.title} — conforme (${verdict.findings.length} règles vérifiées).`,
      );
      memorized = true;
    }

    return {
      intention: { ...intention, status },
      candidate,
      verdict,
      disposition,
      memorized,
    };
  }
}
