/**
 * Persistance du daemon — deux implémentations d'un même contrat :
 *
 *  - SupabaseStore : écrit dans le schéma réel (clé service_role, jamais
 *    exposée au front). Le cockpit devient le tableau de bord vivant.
 *  - DryRunStore  : sans Supabase, écrit des JSON dans outbox/ et tient
 *    les compteurs en mémoire — la chaîne complète reste démontrable.
 *
 * Le verdict reste immuable : on n'update jamais une ligne de verdict.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Candidate, Intention, LoopResult, MemoryStore, MemoryToken } from "@chassis/core";

export interface PersistedResult {
  /** Id de l'intention côté persistance (uuid Supabase ou id local). */
  intentionId: string;
}

export interface DaemonStore {
  readonly label: string;
  /** Retourne l'id de catégorie pour un libellé (créée si absente). */
  ensureCategory(label: string): Promise<string>;
  /** Persiste une intention à l'admission ; retourne son id persistant. */
  createIntention(intention: Intention, categoryId: string): Promise<string>;
  /** Persiste candidat + verdict + jeton mémoire éventuel d'un run de boucle. */
  persistResult(persistedId: string, result: LoopResult, pendingTokens: MemoryToken[]): Promise<void>;
  /** Enregistre un verdict institutionnel et clôt l'intention. */
  recordSettlement(intentionId: string, accepted: boolean, motive?: string): Promise<void>;
  /** Recalcule le point de courbe de la semaine ISO courante. */
  refreshCurve(): Promise<void>;
  /** Store de rappel pour la mémoire darwinienne. */
  memoryStore(): MemoryStore;
}

export function isoWeek(date = new Date()): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* ── Supabase ──────────────────────────────────────────────────────────── */

export class SupabaseStore implements DaemonStore {
  readonly label = "supabase";
  private sb: SupabaseClient;
  private categories = new Map<string, string>();

  constructor(
    url: string,
    serviceRoleKey: string,
    private readonly instanceId: string,
  ) {
    this.sb = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async ensureCategory(label: string): Promise<string> {
    const cached = this.categories.get(label);
    if (cached) return cached;
    const { data: existing, error: selErr } = await this.sb
      .from("categories")
      .select("id")
      .eq("instance_id", this.instanceId)
      .eq("label", label)
      .limit(1);
    if (selErr) throw selErr;
    if (existing?.[0]) {
      this.categories.set(label, existing[0].id);
      return existing[0].id;
    }
    // Créée en copilot : l'humain valide chaque sortie tant que la courbe
    // n'a pas justifié davantage (l'autonomie monte seuil par seuil, en base).
    const { data, error } = await this.sb
      .from("categories")
      .insert({ instance_id: this.instanceId, label, autonomy: "copilot" })
      .select("id")
      .single();
    if (error) throw error;
    this.categories.set(label, data.id);
    return data.id;
  }

  async createIntention(intention: Intention, categoryId: string): Promise<string> {
    const { data, error } = await this.sb
      .from("intentions")
      .insert({
        instance_id: this.instanceId,
        category_id: categoryId,
        title: intention.title,
        payload: intention.payload,
        criterion: intention.criterion,
        status: intention.criterion ? "processing" : "out_of_scope",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async persistResult(
    persistedId: string,
    result: LoopResult,
    pendingTokens: MemoryToken[],
  ): Promise<void> {
    let verdictDbId: string | null = null;

    if (result.candidate) {
      const content =
        typeof result.candidate.content === "string"
          ? (() => {
              try {
                return JSON.parse(result.candidate!.content as string);
              } catch {
                return { text: result.candidate!.content };
              }
            })()
          : result.candidate.content;
      const { data: cand, error: candErr } = await this.sb
        .from("candidates")
        .insert({
          intention_id: persistedId,
          content,
          produced_by: result.candidate.producedBy,
          cost_usd: result.candidate.costUsd,
          latency_ms: result.candidate.latencyMs,
        })
        .select("id")
        .single();
      if (candErr) throw candErr;

      if (result.verdict) {
        const { data: verd, error: verdErr } = await this.sb
          .from("verdicts")
          .insert({
            candidate_id: cand.id,
            intention_id: persistedId,
            outcome: result.verdict.outcome,
            findings: result.verdict.findings,
            harness_reliability: result.verdict.harnessReliability,
          })
          .select("id")
          .single();
        if (verdErr) throw verdErr;
        verdictDbId = verd.id;
      }
    }

    const { error: statusErr } = await this.sb
      .from("intentions")
      .update({ status: result.intention.status })
      .eq("id", persistedId);
    if (statusErr) throw statusErr;

    // Jetons admis pendant le run : provenance = le verdict réel en base.
    for (const token of pendingTokens) {
      if (token.provenance.type === "verdict" && verdictDbId) {
        const { error } = await this.sb.from("memory_tokens").insert({
          instance_id: this.instanceId,
          kind: token.kind,
          summary: token.summary,
          verdict_id: verdictDbId,
        });
        if (error) throw error;
      }
    }
  }

  async recordSettlement(intentionId: string, accepted: boolean, motive?: string): Promise<void> {
    const { error } = await this.sb
      .from("settlements")
      .upsert({ intention_id: intentionId, accepted, motive: motive ?? null });
    if (error) throw error;
    const { error: upErr } = await this.sb
      .from("intentions")
      .update({ status: "settled" })
      .eq("id", intentionId);
    if (upErr) throw upErr;
    if (!accepted) {
      const { error: memErr } = await this.sb.from("memory_tokens").insert({
        instance_id: this.instanceId,
        kind: "learned_rejection",
        summary: `Rejet institutionnel — ${motive ?? "motif non précisé"} (intention ${intentionId}).`,
        settlement_id: intentionId,
      });
      if (memErr) throw memErr;
    }
  }

  async refreshCurve(): Promise<void> {
    // Premier verdict de chaque intention de la semaine courante.
    const { data: verdicts, error } = await this.sb
      .from("verdicts")
      .select("intention_id,outcome,issued_at,intentions!inner(instance_id)")
      .eq("intentions.instance_id", this.instanceId)
      .order("issued_at", { ascending: true });
    if (error) throw error;
    const week = isoWeek();
    const first = new Map<string, { outcome: string; week: string }>();
    for (const v of verdicts ?? []) {
      if (!first.has(v.intention_id)) {
        first.set(v.intention_id, { outcome: v.outcome, week: isoWeek(new Date(v.issued_at)) });
      }
    }
    const thisWeek = [...first.values()].filter((v) => v.week === week);
    if (thisWeek.length === 0) return;
    const rate = thisWeek.filter((v) => v.outcome === "passed").length / thisWeek.length;
    const { error: upErr } = await this.sb.from("curve_points").upsert({
      instance_id: this.instanceId,
      week_iso: week,
      with_memory: true,
      first_pass_rate: rate,
      sample_size: thisWeek.length,
    });
    if (upErr) throw upErr;
  }

  memoryStore(): MemoryStore {
    const sb = this.sb;
    const instanceId = this.instanceId;
    return {
      // put() est différé : le daemon persiste les jetons via persistResult,
      // avec l'uuid réel du verdict (provenance vérifiable en base).
      async put() {},
      async revoke(tokenId: string) {
        await sb.from("memory_tokens").update({ revoked: true }).eq("id", tokenId);
      },
      async recall(instance: string, query: string, limit = 8) {
        const terms = query.split(/\s+/).filter((t) => t.length > 3).slice(0, 4);
        let req = sb
          .from("memory_tokens")
          .select("id,instance_id,kind,summary,revoked,created_at,verdict_id,settlement_id")
          .eq("instance_id", instanceId)
          .eq("revoked", false)
          .limit(limit);
        if (terms.length > 0) {
          req = req.or(terms.map((t) => `summary.ilike.%${t}%`).join(","));
        }
        const { data, error } = await req;
        if (error) throw error;
        return (data ?? []).map((r) => ({
          id: r.id,
          instanceId: r.instance_id,
          kind: r.kind,
          summary: r.summary,
          provenance: r.verdict_id
            ? { type: "verdict" as const, verdictId: r.verdict_id }
            : { type: "settlement" as const, intentionId: r.settlement_id },
          revoked: r.revoked,
          createdAt: r.created_at,
        }));
      },
      async count(instance: string) {
        const { count, error } = await sb
          .from("memory_tokens")
          .select("id", { count: "exact", head: true })
          .eq("instance_id", instanceId)
          .eq("revoked", false);
        if (error) throw error;
        return count ?? 0;
      },
    };
  }
}

/* ── Dry-run (sans Supabase) ───────────────────────────────────────────── */

import { InMemoryStore } from "@chassis/core";

export class DryRunStore implements DaemonStore {
  readonly label = "dry-run (aucun Supabase configuré)";
  private seq = 0;
  private mem = new InMemoryStore();
  private firstVerdicts = new Map<string, "passed" | "rejected" | "unverifiable">();

  constructor(private readonly outboxDir: string) {
    mkdirSync(outboxDir, { recursive: true });
  }

  async ensureCategory(label: string): Promise<string> {
    return `cat_${label.toLowerCase().replace(/\W+/g, "-")}`;
  }

  async createIntention(intention: Intention): Promise<string> {
    this.seq += 1;
    return `LOC-${String(this.seq).padStart(4, "0")}`;
  }

  async persistResult(
    persistedId: string,
    result: LoopResult,
    pendingTokens: MemoryToken[],
  ): Promise<void> {
    if (result.verdict && !this.firstVerdicts.has(persistedId)) {
      this.firstVerdicts.set(persistedId, result.verdict.outcome);
    }
    for (const token of pendingTokens) {
      await this.mem.put(token);
    }
    const out = {
      intentionId: persistedId,
      title: result.intention.title,
      status: result.intention.status,
      disposition: result.disposition,
      verdict: result.verdict
        ? { outcome: result.verdict.outcome, findings: result.verdict.findings }
        : null,
      candidate: result.candidate
        ? { content: result.candidate.content, producedBy: result.candidate.producedBy }
        : null,
      memorized: result.memorized,
    };
    writeFileSync(join(this.outboxDir, `${persistedId}.json`), JSON.stringify(out, null, 2));
  }

  async recordSettlement(intentionId: string, accepted: boolean, motive?: string): Promise<void> {
    if (!accepted) {
      await this.mem.put({
        id: `tok_stl_${intentionId}`,
        instanceId: "inst_local",
        kind: "learned_rejection",
        summary: `Rejet institutionnel — ${motive ?? "motif non précisé"} (intention ${intentionId}).`,
        provenance: { type: "settlement", intentionId },
        revoked: false,
        createdAt: new Date().toISOString(),
      });
    }
    writeFileSync(
      join(this.outboxDir, `${intentionId}.settlement.json`),
      JSON.stringify({ intentionId, accepted, motive: motive ?? null }, null, 2),
    );
  }

  async refreshCurve(): Promise<void> {
    const all = [...this.firstVerdicts.values()];
    if (all.length === 0) return;
    const rate = all.filter((o) => o === "passed").length / all.length;
    writeFileSync(
      join(this.outboxDir, "_courbe.json"),
      JSON.stringify(
        { week: isoWeek(), firstPassRate: rate, sampleSize: all.length, withMemory: true },
        null,
        2,
      ),
    );
  }

  memoryStore(): MemoryStore {
    return this.mem;
  }
}
