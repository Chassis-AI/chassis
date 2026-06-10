/**
 * Mémoire darwinienne (principe 4).
 *
 * Invariant : il n'existe AUCUNE méthode d'insertion directe.
 * Un jeton naît d'un verdict "passed" (admitFromVerdict) ou d'un
 * verdict réel (admitFromSettlement). Tout le reste est refusé.
 * Un jeton contredit par le réel est révoqué, jamais réécrit.
 */

import type { MemoryToken, SettlementRecord, Verdict } from "./types.js";

export interface MemoryStore {
  put(token: MemoryToken): Promise<void>;
  revoke(tokenId: string): Promise<void>;
  /** Recherche les jetons pertinents pour une tâche (impl. vectorielle ou lexicale). */
  recall(instanceId: string, query: string, limit?: number): Promise<MemoryToken[]>;
  count(instanceId: string): Promise<number>;
}

/** Implémentation en mémoire — suffisante pour le pilote et les tests. */
export class InMemoryStore implements MemoryStore {
  private tokens = new Map<string, MemoryToken>();

  async put(token: MemoryToken): Promise<void> {
    this.tokens.set(token.id, token);
  }

  async revoke(tokenId: string): Promise<void> {
    const t = this.tokens.get(tokenId);
    if (t) this.tokens.set(tokenId, { ...t, revoked: true });
  }

  async recall(instanceId: string, query: string, limit = 8): Promise<MemoryToken[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return [...this.tokens.values()]
      .filter((t) => t.instanceId === instanceId && !t.revoked)
      .map((t) => ({
        token: t,
        score: terms.filter((term) => t.summary.toLowerCase().includes(term)).length,
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.token);
  }

  async count(instanceId: string): Promise<number> {
    return [...this.tokens.values()].filter(
      (t) => t.instanceId === instanceId && !t.revoked,
    ).length;
  }
}

export class DarwinianMemory {
  constructor(private readonly store: MemoryStore) {}

  /** Seule porte n°1 : un verdict passé. */
  async admitFromVerdict(
    instanceId: string,
    verdict: Verdict,
    summary: string,
  ): Promise<MemoryToken> {
    if (verdict.outcome !== "passed") {
      throw new Error(
        `Mémoire refusée : verdict ${verdict.outcome}. Seul un verdict "passed" entre en mémoire.`,
      );
    }
    const token: MemoryToken = {
      id: `tok_${verdict.id}`,
      instanceId,
      kind: "validated_fix",
      summary,
      provenance: { type: "verdict", verdictId: verdict.id },
      revoked: false,
      createdAt: new Date().toISOString(),
    };
    await this.store.put(token);
    return token;
  }

  /** Seule porte n°2 : un rejet réel devient une leçon apprise. */
  async admitFromSettlement(
    instanceId: string,
    settlement: SettlementRecord,
    summary: string,
  ): Promise<MemoryToken> {
    const token: MemoryToken = {
      id: `tok_stl_${settlement.intentionId}`,
      instanceId,
      kind: "learned_rejection",
      summary,
      provenance: { type: "settlement", intentionId: settlement.intentionId },
      revoked: false,
      createdAt: new Date().toISOString(),
    };
    await this.store.put(token);
    return token;
  }

  async revoke(tokenId: string): Promise<void> {
    await this.store.revoke(tokenId);
  }

  async recall(instanceId: string, query: string, limit?: number): Promise<MemoryToken[]> {
    return this.store.recall(instanceId, query, limit);
  }

  async count(instanceId: string): Promise<number> {
    return this.store.count(instanceId);
  }
}
