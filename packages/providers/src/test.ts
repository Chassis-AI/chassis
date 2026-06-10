/**
 * Provider de test — déterministe, hors-ligne, gratuit.
 *
 * Sert aux tests du routeur/boucle et aux démos sans clé API.
 * Le répondeur est injecté : le test décide ce que "le modèle" répond.
 */

import type { ModelProvider } from "@chassis/core";

export interface TestProviderOptions {
  id?: string;
  tier?: 1 | 2 | 3;
  /** Latence simulée (ms réelles d'attente : 0 par défaut). */
  simulatedLatencyMs?: number;
  /** Si défini, chaque appel échoue — pour tester le fallback du routeur. */
  failWith?: string;
}

export function testProvider(
  respond: (prompt: string) => string,
  options: TestProviderOptions = {},
): ModelProvider {
  return {
    id: options.id ?? "test:deterministic",
    costPerMTokUsd: 0,
    typicalLatencyMs: options.simulatedLatencyMs ?? 0,
    tier: options.tier ?? 3,

    async complete(prompt) {
      if (options.failWith) {
        throw new Error(options.failWith);
      }
      if (options.simulatedLatencyMs) {
        await new Promise((r) => setTimeout(r, options.simulatedLatencyMs));
      }
      return {
        text: respond(prompt),
        costUsd: 0,
        latencyMs: options.simulatedLatencyMs ?? 0,
      };
    },
  };
}
