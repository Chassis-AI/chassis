/**
 * Adaptateur Anthropic pour le ModelRouter de @chassis/core.
 *
 * Le routeur n'importe aucun SDK (principe 6) : cet adaptateur vit ici
 * et s'injecte via router.register(). Le coût est calculé depuis l'usage
 * réel retourné par l'API — jamais estimé à l'aveugle.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ModelProvider } from "@chassis/core";

/** Tarifs publics par MTok (USD) — source : platform.claude.com, 2026-05. */
interface ModelSpec {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  tier: 1 | 2 | 3;
  typicalLatencyMs: number;
  /** Le modèle supporte thinking adaptatif (familles 4.6+). */
  adaptiveThinking: boolean;
}

export const ANTHROPIC_MODELS: Record<string, ModelSpec> = {
  "claude-opus-4-8": {
    inputUsdPerMTok: 5,
    outputUsdPerMTok: 25,
    tier: 1,
    typicalLatencyMs: 8000,
    adaptiveThinking: true,
  },
  "claude-sonnet-4-6": {
    inputUsdPerMTok: 3,
    outputUsdPerMTok: 15,
    tier: 2,
    typicalLatencyMs: 4000,
    adaptiveThinking: true,
  },
  "claude-haiku-4-5": {
    inputUsdPerMTok: 1,
    outputUsdPerMTok: 5,
    tier: 3,
    typicalLatencyMs: 1500,
    adaptiveThinking: false,
  },
};

export interface AnthropicProviderOptions {
  /** Clé API — défaut : ANTHROPIC_API_KEY de l'environnement. */
  apiKey?: string;
  /** max_tokens par défaut des appels (surchargé par opts.maxTokens). */
  defaultMaxTokens?: number;
}

/**
 * Crée un ModelProvider branché sur l'API Anthropic (Messages API).
 * Un provider = un modèle ; enregistrer plusieurs providers donne au
 * routeur le choix par tiers/coût (ex. opus en jugement, haiku en extraction).
 */
export function anthropicProvider(
  model: keyof typeof ANTHROPIC_MODELS = "claude-opus-4-8",
  options: AnthropicProviderOptions = {},
): ModelProvider {
  const spec = ANTHROPIC_MODELS[model];
  if (!spec) {
    throw new Error(
      `Modèle Anthropic inconnu : ${String(model)}. Connus : ${Object.keys(ANTHROPIC_MODELS).join(", ")}`,
    );
  }
  const client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});

  return {
    id: `anthropic:${model}`,
    costPerMTokUsd: (spec.inputUsdPerMTok + spec.outputUsdPerMTok) / 2,
    typicalLatencyMs: spec.typicalLatencyMs,
    tier: spec.tier,

    async complete(prompt, opts) {
      const started = Date.now();
      const response = await client.messages.create({
        model,
        max_tokens: opts?.maxTokens ?? options.defaultMaxTokens ?? 16000,
        ...(spec.adaptiveThinking ? { thinking: { type: "adaptive" as const } } : {}),
        messages: [{ role: "user", content: prompt }],
      });
      const latencyMs = Date.now() - started;

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const costUsd =
        (response.usage.input_tokens / 1_000_000) * spec.inputUsdPerMTok +
        (response.usage.output_tokens / 1_000_000) * spec.outputUsdPerMTok;

      return { text, costUsd, latencyMs };
    },
  };
}

/** True si une clé API Anthropic est disponible dans l'environnement. */
export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
