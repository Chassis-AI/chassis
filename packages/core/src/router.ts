/**
 * Routeur de modèles (principe 6 : modèles = commodité).
 *
 * Les moteurs sont interchangeables ; la politique de routage choisit
 * par tâche, coût et latence. Aucun SDK n'est importé ici : les
 * providers sont injectés (adapter Anthropic, OpenAI, local…).
 */

export interface ModelProvider {
  id: string;
  /** Coût indicatif par million de tokens (entrée+sortie moyenné). */
  costPerMTokUsd: number;
  /** Latence indicative (ms) pour une tâche courante. */
  typicalLatencyMs: number;
  /** Tiers de capacité : 1 = frontier, 2 = standard, 3 = léger/local. */
  tier: 1 | 2 | 3;
  complete(prompt: string, opts?: { maxTokens?: number }): Promise<{
    text: string;
    costUsd: number;
    latencyMs: number;
  }>;
}

export type TaskProfile = "extraction" | "generation" | "judgment";

export interface RoutingPolicy {
  /** Tiers minimal exigé par profil de tâche. */
  minTier: Record<TaskProfile, 1 | 2 | 3>;
  /** Budget max par appel (USD) — 0 = illimité. */
  maxCostUsd: number;
}

export const DEFAULT_POLICY: RoutingPolicy = {
  minTier: { extraction: 3, generation: 2, judgment: 1 },
  maxCostUsd: 0,
};

export class ModelRouter {
  private providers: ModelProvider[] = [];

  constructor(private policy: RoutingPolicy = DEFAULT_POLICY) {}

  register(provider: ModelProvider): void {
    this.providers.push(provider);
  }

  setPolicy(policy: RoutingPolicy): void {
    this.policy = policy;
  }

  /** Choisit le moteur le moins cher satisfaisant le tiers requis. */
  pick(profile: TaskProfile): ModelProvider {
    const required = this.policy.minTier[profile];
    const eligible = this.providers
      .filter((p) => p.tier <= required)
      .sort((a, b) => a.costPerMTokUsd - b.costPerMTokUsd);
    const chosen = eligible[0];
    if (!chosen) {
      throw new Error(
        `Aucun moteur disponible pour le profil "${profile}" (tiers requis <= ${required}).`,
      );
    }
    return chosen;
  }

  /** Fallback automatique : essaie le suivant si le premier échoue. */
  async complete(
    profile: TaskProfile,
    prompt: string,
    opts?: { maxTokens?: number },
  ): Promise<{ text: string; costUsd: number; latencyMs: number; providerId: string }> {
    const required = this.policy.minTier[profile];
    const candidates = this.providers
      .filter((p) => p.tier <= required)
      .sort((a, b) => a.costPerMTokUsd - b.costPerMTokUsd);
    let lastError: unknown;
    for (const provider of candidates) {
      try {
        const res = await provider.complete(prompt, opts);
        return { ...res, providerId: provider.id };
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`Tous les moteurs ont échoué pour "${profile}" : ${String(lastError)}`);
  }
}
