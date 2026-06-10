/**
 * Tests @chassis/daemon — parseurs, règles v0, stores et chaîne complète
 * en dry-run (aucun réseau, aucun Supabase).
 */

import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { Candidate, Intention, MemoryToken } from "@chassis/core";
import { InMemoryStore } from "@chassis/core";
import { buildRuntime, CaptureMemoryStore, processDossier } from "../daemon.js";
import { parseProposition, RULES } from "../rules.js";
import { DryRunStore, isoWeek } from "../store.js";
import { parseDossier, parseHistory, parseSettlement, type HistoryFile } from "../types.js";

const TMP = mkdtempSync(join(tmpdir(), "chassis-test-"));
after(() => rmSync(TMP, { recursive: true, force: true }));

/* ── Parseurs ──────────────────────────────────────────────────────────── */

describe("parseurs de fichiers", () => {
  it("accepte un dossier valide, refuse les champs manquants", () => {
    const ok = parseDossier('{"title":"t","category":"c","payload":{}}');
    assert.equal(ok.title, "t");
    assert.throws(() => parseDossier('{"category":"c","payload":{}}'), /title/);
    assert.throws(() => parseDossier('{"title":"t","payload":{}}'), /category/);
    assert.throws(() => parseDossier('{"title":"t","category":"c"}'), /payload/);
    assert.throws(() => parseDossier('{"title":"t","category":"c","payload":{},"ruleIds":"x"}'), /ruleIds/);
    assert.throws(() => parseDossier("pas du json"));
  });

  it("valide settlements et historique", () => {
    assert.equal(parseSettlement('{"intentionId":"i1","accepted":true}').accepted, true);
    assert.throws(() => parseSettlement('{"intentionId":"i1"}'), /accepted/);
    assert.throws(() => parseSettlement('{"accepted":true}'), /intentionId/);
    const h = parseHistory(
      '{"title":"t","payload":{},"ruleIds":["r"],"proposition":{},"accepted":false}',
    );
    assert.equal(h.accepted, false);
    assert.throws(() => parseHistory('{"title":"t","payload":{},"ruleIds":["r"]}'), /proposition/);
  });
});

/* ── Règles v0 ─────────────────────────────────────────────────────────── */

function fab(payload: unknown, content: unknown): { intention: Intention; candidate: Candidate } {
  return {
    intention: {
      id: "i1",
      instanceId: "inst",
      categoryId: "cat",
      title: "t",
      payload,
      criterion: { kind: "institutional", ruleIds: RULES.map((r) => r.id), description: "" },
      status: "queued",
      createdAt: new Date().toISOString(),
    },
    candidate: { id: "c1", intentionId: "i1", content, producedBy: "test", costUsd: 0, latencyMs: 0 },
  };
}

describe("règles v0 (démonstrateurs)", () => {
  const assiette = RULES.find((r) => r.id === "paie.assiette-primes")!;
  const subro = RULES.find((r) => r.id === "ij.subrogation")!;

  it("assiette : base + primes exigé", async () => {
    const { intention, candidate } = fab(
      { salaireBase: 1000, primes: 200 },
      '{"assiette":1200}',
    );
    assert.equal((await assiette.evaluate(intention, candidate)).ok, true);
    const ko = fab({ salaireBase: 1000, primes: 200 }, '{"assiette":1000}');
    assert.equal((await assiette.evaluate(ko.intention, ko.candidate)).ok, false);
  });

  it("subrogation : maintien borné à la période", async () => {
    const ok = fab(
      { maintienFin: "2026-06-30", subrogationFin: "2026-06-14" },
      '{"assiette":0,"maintienFin":"2026-06-14"}',
    );
    assert.equal((await subro.evaluate(ok.intention, ok.candidate)).ok, true);
    const ko = fab({ maintienFin: "2026-06-30", subrogationFin: "2026-06-14" }, '{"assiette":0}');
    assert.equal((await subro.evaluate(ko.intention, ko.candidate)).ok, false); // retombe sur le payload
  });

  it("parseProposition survit aux contenus non-JSON", () => {
    const { candidate } = fab({}, "texte sans json");
    assert.equal(parseProposition(candidate), null);
    const { candidate: c2 } = fab({}, 'préambule {"assiette": 5} épilogue');
    assert.equal(parseProposition(c2)?.assiette, 5);
  });
});

/* ── CaptureMemoryStore ────────────────────────────────────────────────── */

describe("CaptureMemoryStore", () => {
  it("intercepte les écritures (drain) et délègue le rappel", async () => {
    const inner = new InMemoryStore();
    await inner.put({
      id: "tok_a",
      instanceId: "inst",
      kind: "validated_fix",
      summary: "acquis assiette",
      provenance: { type: "verdict", verdictId: "v0" },
      revoked: false,
      createdAt: "",
    });
    const cap = new CaptureMemoryStore(inner);
    const tok: MemoryToken = {
      id: "tok_b",
      instanceId: "inst",
      kind: "validated_fix",
      summary: "nouveau",
      provenance: { type: "verdict", verdictId: "v1" },
      revoked: false,
      createdAt: "",
    };
    await cap.put(tok);
    assert.equal(await cap.count("inst"), 1); // l'inner n'a PAS reçu tok_b
    assert.equal((await cap.recall("inst", "assiette")).length, 1); // rappel délégué
    assert.deepEqual(cap.drain(), [tok]);
    assert.deepEqual(cap.drain(), []); // drain vide ensuite
  });
});

/* ── Chaîne complète en dry-run ────────────────────────────────────────── */

const HISTORY: HistoryFile[] = [
  { title: "h1", payload: { salaireBase: 1000, primes: 100 }, ruleIds: ["paie.assiette-primes"], proposition: { assiette: 1100 }, accepted: true },
  { title: "h2", payload: { salaireBase: 1000, primes: 100 }, ruleIds: ["paie.assiette-primes"], proposition: { assiette: 1000 }, accepted: false },
];

describe("processDossier (dry-run)", () => {
  it("conforme → proposed + mémorisé + écrit dans l'outbox + courbe", async () => {
    const store = new DryRunStore(join(TMP, "out1"));
    const runtime = await buildRuntime(store, HISTORY);
    assert.equal(runtime.harness.mayPropose, true);

    const { persistedId, result } = await processDossier(runtime, store, "inst_local", {
      title: "DSN test",
      category: "Paie",
      payload: { salaireBase: 2000, primes: 300 },
      ruleIds: ["paie.assiette-primes"],
    });
    assert.equal(result.disposition, "proposed");
    assert.equal(result.verdict?.outcome, "passed");
    assert.equal(result.memorized, true);
    const out = JSON.parse(readFileSync(join(TMP, "out1", `${persistedId}.json`), "utf8"));
    assert.equal(out.verdict.outcome, "passed");
    assert.ok(readdirSync(join(TMP, "out1")).includes("_courbe.json"));
    assert.equal(await store.memoryStore().count("inst_local"), 1);
  });

  it("sans critère → returned_to_human ; règle inconnue → erreur explicite", async () => {
    const store = new DryRunStore(join(TMP, "out2"));
    const runtime = await buildRuntime(store, HISTORY);
    const { result } = await processDossier(runtime, store, "inst_local", {
      title: "Conseil",
      category: "Conseil",
      payload: { question: "?" },
    });
    assert.equal(result.disposition, "returned_to_human");
    assert.equal(result.intention.status, "out_of_scope");

    await assert.rejects(
      processDossier(runtime, store, "inst_local", {
        title: "x",
        category: "x",
        payload: {},
        ruleIds: ["regle.fantome"],
      }),
      /Règles inconnues/,
    );
  });

  it("harness non calibré → tout part en ombre", async () => {
    const store = new DryRunStore(join(TMP, "out3"));
    const runtime = await buildRuntime(store, []); // aucun historique
    assert.equal(runtime.harness.mayPropose, false);
    const { result } = await processDossier(runtime, store, "inst_local", {
      title: "DSN",
      category: "Paie",
      payload: { salaireBase: 1, primes: 1 },
      ruleIds: ["paie.assiette-primes"],
    });
    assert.equal(result.disposition, "shadowed");
  });

  it("settlement rejeté → règle apprise en mémoire", async () => {
    const store = new DryRunStore(join(TMP, "out4"));
    await store.recordSettlement("LOC-0001", false, "assiette");
    assert.equal(await store.memoryStore().count("inst_local"), 1);
    const recalled = await store.memoryStore().recall("inst_local", "assiette");
    assert.equal(recalled[0]?.kind, "learned_rejection");
  });
});

/* ── Semaine ISO ───────────────────────────────────────────────────────── */

describe("isoWeek", () => {
  it("calcule la semaine ISO (bords d'année inclus)", () => {
    assert.equal(isoWeek(new Date("2026-01-01")), "2026-W01"); // jeudi
    assert.equal(isoWeek(new Date("2024-12-30")), "2025-W01"); // lundi rattaché à 2025
    assert.equal(isoWeek(new Date("2026-06-10")), "2026-W24");
  });
});
