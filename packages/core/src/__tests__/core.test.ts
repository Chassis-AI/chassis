/**
 * Tests du cœur CHASSIS — chaque test vérifie un invariant doctrinal,
 * pas un détail d'implémentation.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Harness, type CalibrationCase } from "../harness.js";
import { ChassisLoop } from "../loop.js";
import { DarwinianMemory, InMemoryStore } from "../memory.js";
import { ModelRouter, type ModelProvider } from "../router.js";
import type { Candidate, Category, HarnessRule, Intention, Verdict } from "../types.js";

/* ── Aides ─────────────────────────────────────────────────────────────── */

function intention(overrides: Partial<Intention> = {}): Intention {
  return {
    id: "int_1",
    instanceId: "inst_t",
    categoryId: "cat_t",
    title: "dossier de test",
    payload: { valeur: 42 },
    criterion: { kind: "formal", ruleIds: ["r.pair"], description: "valeur paire" },
    status: "queued",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function candidate(content: unknown, id = "cd_1"): Candidate {
  return { id, intentionId: "int_1", content, producedBy: "test", costUsd: 0, latencyMs: 0 };
}

/** Règle : le contenu candidat (nombre) doit être pair. */
const reglePair: HarnessRule = {
  id: "r.pair",
  version: 1,
  origin: "declared",
  description: "le contenu est pair",
  evaluate: (_i, c) => ({
    ruleId: "r.pair",
    ruleVersion: 1,
    ok: typeof c.content === "number" && c.content % 2 === 0,
    detail: String(c.content),
  }),
};

function provider(id: string, opts: Partial<ModelProvider> & { reply?: string; fail?: boolean } = {}): ModelProvider {
  return {
    id,
    costPerMTokUsd: opts.costPerMTokUsd ?? 1,
    typicalLatencyMs: 1,
    tier: opts.tier ?? 2,
    async complete() {
      if (opts.fail) throw new Error(`${id} en panne`);
      return { text: opts.reply ?? `réponse de ${id}`, costUsd: 0.001, latencyMs: 1 };
    },
  };
}

/* ── Harness ───────────────────────────────────────────────────────────── */

describe("Harness — la seule porte", () => {
  it("refuse une version de règle inférieure ou égale à l'existante", () => {
    const h = new Harness();
    h.registerRule(reglePair);
    assert.throws(() => h.registerRule({ ...reglePair, version: 1 }));
    h.registerRule({ ...reglePair, version: 2 }); // supérieure : acceptée
    assert.equal(h.ruleCount, 1);
  });

  it("sans critère → unverifiable, jamais un verdict positif", async () => {
    const h = new Harness();
    const v = await h.evaluate(intention({ criterion: null }), candidate(2));
    assert.equal(v.outcome, "unverifiable");
  });

  it("une règle introuvable produit un finding négatif, pas un crash", async () => {
    const h = new Harness();
    const v = await h.evaluate(
      intention({ criterion: { kind: "formal", ruleIds: ["r.inconnue"], description: "" } }),
      candidate(2),
    );
    assert.equal(v.outcome, "rejected");
    assert.equal(v.findings[0].ok, false);
  });

  it("ne peut pas proposer avant calibration, ni sous le seuil", async () => {
    const h = new Harness({ reliabilityGate: 0.85 });
    h.registerRule(reglePair);
    assert.equal(h.mayPropose, false); // jamais calibré

    // Historique contradictoire : le harness se trompe une fois sur deux.
    const cases: CalibrationCase[] = [
      { intention: intention(), candidate: candidate(2), actualAccepted: true },
      { intention: intention(), candidate: candidate(4), actualAccepted: false },
    ];
    const r = await h.calibrate(cases);
    assert.equal(r, 0.5);
    assert.equal(h.mayPropose, false); // sous le seuil → pas le droit
  });

  it("reconcile signale 'learn' quand le réel contredit le verdict", async () => {
    const h = new Harness();
    h.registerRule(reglePair);
    const v = await h.evaluate(intention(), candidate(2)); // passed
    assert.equal(v.outcome, "passed");
    assert.equal(h.reconcile({ intentionId: "int_1", accepted: false, settledAt: "" }, v), "learn");
    assert.equal(h.reconcile({ intentionId: "int_1", accepted: true, settledAt: "" }, v), "consistent");
  });
});

/* ── Mémoire darwinienne ───────────────────────────────────────────────── */

describe("DarwinianMemory — n'entre que le prouvé", () => {
  const verdict = (outcome: Verdict["outcome"]): Verdict => ({
    id: "vd_1",
    candidateId: "cd_1",
    intentionId: "int_1",
    outcome,
    findings: [],
    harnessReliability: 1,
    issuedAt: "",
  });

  it("refuse tout verdict non 'passed'", async () => {
    const m = new DarwinianMemory(new InMemoryStore());
    await assert.rejects(m.admitFromVerdict("inst_t", verdict("rejected"), "x"));
    await assert.rejects(m.admitFromVerdict("inst_t", verdict("unverifiable"), "x"));
    assert.equal(await m.count("inst_t"), 0);
  });

  it("admet un verdict passed et un settlement ; un jeton révoqué disparaît du rappel", async () => {
    const m = new DarwinianMemory(new InMemoryStore());
    const tok = await m.admitFromVerdict("inst_t", verdict("passed"), "correctif assiette validé");
    await m.admitFromSettlement(
      "inst_t",
      { intentionId: "int_9", accepted: false, settledAt: "" },
      "rejet appris sur la subrogation",
    );
    assert.equal(await m.count("inst_t"), 2);
    assert.equal((await m.recall("inst_t", "assiette")).length, 1);

    await m.revoke(tok.id);
    assert.equal(await m.count("inst_t"), 1);
    assert.equal((await m.recall("inst_t", "assiette")).length, 0); // révoqué = oublié du rappel
  });
});

/* ── Routeur ───────────────────────────────────────────────────────────── */

describe("ModelRouter — moteurs = commodité", () => {
  it("choisit le moins cher satisfaisant le tiers requis", () => {
    const r = new ModelRouter();
    r.register(provider("cher-frontier", { tier: 1, costPerMTokUsd: 15 }));
    r.register(provider("bon-marché", { tier: 2, costPerMTokUsd: 3 }));
    assert.equal(r.pick("generation").id, "bon-marché"); // tiers ≤ 2
    assert.equal(r.pick("judgment").id, "cher-frontier"); // tiers ≤ 1 : seul candidat
  });

  it("bascule sur le moteur suivant quand le premier échoue", async () => {
    const r = new ModelRouter();
    r.register(provider("instable", { tier: 2, costPerMTokUsd: 1, fail: true }));
    r.register(provider("secours", { tier: 2, costPerMTokUsd: 5, reply: "ok" }));
    const res = await r.complete("generation", "prompt");
    assert.equal(res.providerId, "secours");
    assert.equal(res.text, "ok");
  });

  it("échoue explicitement quand aucun moteur ne convient", () => {
    const r = new ModelRouter();
    r.register(provider("léger", { tier: 3 }));
    assert.throws(() => r.pick("judgment")); // exige tiers 1
  });
});

/* ── Boucle ────────────────────────────────────────────────────────────── */

describe("ChassisLoop — dispositions", () => {
  function build(reply: string) {
    const h = new Harness({ reliabilityGate: 0.85 });
    h.registerRule({
      id: "r.json-pair",
      version: 1,
      origin: "declared",
      description: "le JSON candidat contient une valeur paire",
      evaluate: (_i, c) => {
        const n = JSON.parse(String(c.content)).valeur;
        return { ruleId: "r.json-pair", ruleVersion: 1, ok: n % 2 === 0, detail: String(n) };
      },
    });
    const m = new DarwinianMemory(new InMemoryStore());
    const r = new ModelRouter();
    r.register(provider("p", { tier: 2, reply }));
    const loop = new ChassisLoop(h, m, r, async () => ({ prompt: "p" }));
    return { h, m, loop };
  }

  const cat = (autonomy: Category["autonomy"]): Category => ({
    id: "cat_t",
    instanceId: "inst_t",
    label: "Test",
    autonomy,
    autonomyThreshold: 0.98,
  });

  const calibrer = async (h: Harness) => {
    await h.calibrate([
      {
        intention: intention({ criterion: { kind: "formal", ruleIds: ["r.json-pair"], description: "" } }),
        candidate: candidate('{"valeur":2}'),
        actualAccepted: true,
      },
    ]);
  };

  it("sans critère → returned_to_human, rien ne sort", async () => {
    const { loop } = build('{"valeur":2}');
    const res = await loop.run(intention({ criterion: null }), cat("auto"));
    assert.equal(res.disposition, "returned_to_human");
    assert.equal(res.candidate, null);
  });

  it("harness non calibré → shadowed, même si la catégorie est auto", async () => {
    const { loop } = build('{"valeur":2}');
    const res = await loop.run(
      intention({ criterion: { kind: "formal", ruleIds: ["r.json-pair"], description: "" } }),
      cat("auto"),
    );
    assert.equal(res.disposition, "shadowed");
    assert.equal(res.memorized, false);
  });

  it("passed + copilot → proposed et mémorisé ; la sortie moteur est le candidat", async () => {
    const { h, m, loop } = build('{"valeur":2}');
    await calibrer(h);
    const res = await loop.run(
      intention({ criterion: { kind: "formal", ruleIds: ["r.json-pair"], description: "" } }),
      cat("copilot"),
    );
    assert.equal(res.disposition, "proposed");
    assert.equal(res.intention.status, "verified");
    assert.equal(res.candidate?.content, '{"valeur":2}');
    assert.equal(res.memorized, true);
    assert.equal(await m.count("inst_t"), 1);
  });

  it("rejected → anomaly proposé, jamais mémorisé", async () => {
    const { h, m, loop } = build('{"valeur":3}');
    await calibrer(h);
    const res = await loop.run(
      intention({ criterion: { kind: "formal", ruleIds: ["r.json-pair"], description: "" } }),
      cat("auto"),
    );
    assert.equal(res.disposition, "proposed");
    assert.equal(res.intention.status, "anomaly");
    assert.equal(res.memorized, false);
    assert.equal(await m.count("inst_t"), 0);
  });

  it("passed + auto → applied (et le harness reste la porte : mémorisé)", async () => {
    const { h, loop } = build('{"valeur":8}');
    await calibrer(h);
    const res = await loop.run(
      intention({ criterion: { kind: "formal", ruleIds: ["r.json-pair"], description: "" } }),
      cat("auto"),
    );
    assert.equal(res.disposition, "applied");
    assert.equal(res.intention.status, "applied");
  });
});
