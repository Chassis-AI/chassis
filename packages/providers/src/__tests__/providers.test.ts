/**
 * Tests @chassis/providers — l'adaptateur reste honnête sur ses prix
 * et le provider de test reste un instrument de test fiable.
 * (Aucun appel réseau : complete() d'Anthropic n'est jamais invoqué ici.)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ANTHROPIC_MODELS, anthropicProvider } from "../anthropic.js";
import { testProvider } from "../test.js";

describe("testProvider", () => {
  it("répond de façon déterministe, gratuitement", async () => {
    const p = testProvider((prompt) => prompt.toUpperCase(), { id: "t1" });
    const res = await p.complete("abc");
    assert.equal(res.text, "ABC");
    assert.equal(res.costUsd, 0);
    assert.equal(p.costPerMTokUsd, 0);
    assert.equal(p.tier, 3); // léger par défaut
  });

  it("simule une panne quand failWith est défini (test du fallback routeur)", async () => {
    const p = testProvider(() => "jamais", { failWith: "panne simulée" });
    await assert.rejects(p.complete("x"), /panne simulée/);
  });

  it("respecte le tiers injecté", () => {
    assert.equal(testProvider(() => "", { tier: 1 }).tier, 1);
  });
});

describe("anthropicProvider — table des modèles", () => {
  it("chaque modèle a des prix positifs, entrée < sortie, tiers 1-3", () => {
    for (const [model, spec] of Object.entries(ANTHROPIC_MODELS)) {
      assert.ok(spec.inputUsdPerMTok > 0, model);
      assert.ok(spec.outputUsdPerMTok > spec.inputUsdPerMTok, model);
      assert.ok([1, 2, 3].includes(spec.tier), model);
    }
  });

  it("couvre les trois tiers (frontier / standard / léger)", () => {
    const tiers = new Set(Object.values(ANTHROPIC_MODELS).map((s) => s.tier));
    assert.deepEqual([...tiers].sort(), [1, 2, 3]);
  });

  it("expose un coût moyen entrée/sortie cohérent avec la table", () => {
    const p = anthropicProvider("claude-haiku-4-5", { apiKey: "clé-de-test" });
    const spec = ANTHROPIC_MODELS["claude-haiku-4-5"];
    assert.equal(p.id, "anthropic:claude-haiku-4-5");
    assert.equal(p.costPerMTokUsd, (spec.inputUsdPerMTok + spec.outputUsdPerMTok) / 2);
    assert.equal(p.tier, spec.tier);
  });

  it("refuse un modèle inconnu avec la liste des modèles connus", () => {
    assert.throws(
      () => anthropicProvider("claude-imaginaire" as never, { apiKey: "x" }),
      /Modèle Anthropic inconnu/,
    );
  });
});
