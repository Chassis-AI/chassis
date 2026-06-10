/**
 * Couche données du cockpit — une seule forme (CockpitData), deux sources :
 *  - demo : les données seedées de demo.ts (sans .env)
 *  - live : Supabase (lecture réelle + écritures réelles)
 *
 * Principe 8 côté live : tout est calculé depuis les lignes réelles ;
 * quand une donnée n'existe pas encore, on rend null et l'UI affiche
 * « à mesurer » — jamais un chiffre inventé.
 */

import { supabase } from "./supabase";
import {
  CATEGORIES as DEMO_CATEGORIES,
  CURVE as DEMO_CURVE,
  INSTANCE as DEMO_INSTANCE,
  INTENTS as DEMO_INTENTS,
  KPIS as DEMO_KPIS,
  TOKENS as DEMO_TOKENS,
  type StampKind,
} from "../demo";

export type { StampKind };

export interface UiFinding {
  ruleId: string;
  ok: boolean;
  detail: string;
}

export interface UiIntent {
  id: string;
  /** Référence courte affichée dans la file (id métier ou uuid tronqué). */
  ref: string;
  title: string;
  category: string;
  stamp: StampKind;
  applied: boolean;
  findings: UiFinding[];
}

export interface UiToken {
  kind: "fix" | "rej" | "conv";
  date: string;
  summary: string;
}

export interface UiCategory {
  name: string;
  mode: "shadow" | "copilot" | "auto";
  /** Taux de succès vérifié au premier envoi — null tant que rien n'est mesuré. */
  rate: number | null;
  threshold: number;
  weeks: number;
}

export interface UiCurve {
  weeks: string[];
  withMemory: number[];
  withoutMemory: number[];
}

export interface UiKpi {
  /** null = pas encore mesurable → l'UI affiche « à mesurer » (traduit). */
  v: string | null;
  /** Clé i18n du libellé (la valeur est une donnée, le libellé est de la chrome). */
  l: string;
  em: boolean;
}

export interface CockpitData {
  mode: "demo" | "live";
  instance: {
    id: string | null;
    name: string;
    domain: string;
    /** Fiabilité du harness — null tant qu'aucun verdict n'existe. */
    harnessReliability: number | null;
  };
  intents: UiIntent[];
  tokens: UiToken[];
  categories: UiCategory[];
  /** null = pas encore de points réels → l'UI affiche « à mesurer ». */
  curve: UiCurve | null;
  kpis: UiKpi[];
}

/* ── Source démo ─────────────────────────────────────────────────────── */

export function loadDemoData(): CockpitData {
  return {
    mode: "demo",
    instance: {
      id: null,
      name: DEMO_INSTANCE.name,
      domain: DEMO_INSTANCE.domain,
      harnessReliability: DEMO_INSTANCE.harnessReliability,
    },
    intents: DEMO_INTENTS.map((i) => ({
      id: i.id,
      ref: i.id,
      title: i.title,
      category: i.category,
      stamp: i.stamp,
      applied: false,
      findings: i.findings,
    })),
    tokens: DEMO_TOKENS.map((t) => ({ kind: t.kind, date: t.date, summary: t.summary })),
    categories: DEMO_CATEGORIES.map((c) => ({
      name: c.name,
      mode: c.mode,
      rate: c.mode === "shadow" ? null : c.rate,
      threshold: c.threshold,
      weeks: c.weeks,
    })),
    curve: DEMO_CURVE,
    kpis: DEMO_KPIS.map((k) => ({ ...k })),
  };
}

/* ── Source live (Supabase) ──────────────────────────────────────────── */

interface IntentionRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
  category_id: string | null;
}

interface VerdictRow {
  id: string;
  intention_id: string;
  outcome: "passed" | "rejected" | "unverifiable";
  findings: UiFinding[];
  harness_reliability: number;
  issued_at: string;
}

const STATUS_STAMP: Record<string, StampKind> = {
  queued: "idle",
  processing: "idle",
  verified: "pass",
  anomaly: "fail",
  out_of_scope: "hold",
  applied: "pass",
  settled: "pass",
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}·${mm}`;
}

function isoWeek(iso: string): string {
  const d = new Date(iso);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** L'utilisateur connecté n'a pas encore d'instance. */
export class NoInstanceError extends Error {
  constructor() {
    super("Aucune instance pour cet utilisateur.");
    this.name = "NoInstanceError";
  }
}

export async function loadLiveData(): Promise<CockpitData> {
  if (!supabase) throw new Error("Supabase non configuré (mode démo attendu).");

  const { data: instances, error: instErr } = await supabase
    .from("instances")
    .select("id,name,domain")
    .order("created_at", { ascending: true })
    .limit(1);
  if (instErr) throw instErr;
  const instance = instances?.[0];
  if (!instance) throw new NoInstanceError();

  const [categoriesQ, intentionsQ, tokensQ, curveQ] = await Promise.all([
    supabase
      .from("categories")
      .select("id,label,autonomy,autonomy_threshold")
      .eq("instance_id", instance.id)
      .order("label"),
    supabase
      .from("intentions")
      .select("id,title,status,created_at,category_id")
      .eq("instance_id", instance.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("memory_tokens")
      .select("kind,summary,created_at")
      .eq("instance_id", instance.id)
      .eq("revoked", false)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("curve_points")
      .select("week_iso,with_memory,first_pass_rate,sample_size")
      .eq("instance_id", instance.id),
  ]);
  for (const q of [categoriesQ, intentionsQ, tokensQ, curveQ]) {
    if (q.error) throw q.error;
  }

  const categories = categoriesQ.data ?? [];
  const intentions = (intentionsQ.data ?? []) as IntentionRow[];

  let verdicts: VerdictRow[] = [];
  if (intentions.length > 0) {
    const { data, error } = await supabase
      .from("verdicts")
      .select("id,intention_id,outcome,findings,harness_reliability,issued_at")
      .in(
        "intention_id",
        intentions.map((i) => i.id),
      )
      .order("issued_at", { ascending: true });
    if (error) throw error;
    verdicts = (data ?? []) as VerdictRow[];
  }

  const latestVerdict = new Map<string, VerdictRow>();
  const firstVerdict = new Map<string, VerdictRow>();
  for (const v of verdicts) {
    latestVerdict.set(v.intention_id, v); // trié ascendant → le dernier gagne
    if (!firstVerdict.has(v.intention_id)) firstVerdict.set(v.intention_id, v);
  }

  const catLabel = new Map(categories.map((c) => [c.id, c.label]));

  const intents: UiIntent[] = intentions.map((i) => ({
    id: i.id,
    ref: i.id.slice(0, 8).toUpperCase(),
    title: i.title,
    category: (i.category_id && catLabel.get(i.category_id)) || "Sans catégorie",
    stamp: STATUS_STAMP[i.status] ?? "idle",
    applied: i.status === "applied" || i.status === "settled",
    findings: latestVerdict.get(i.id)?.findings ?? [],
  }));

  // Fiabilité du harness : celle du dernier verdict rendu — sinon null.
  const lastIssued = verdicts[verdicts.length - 1];
  const harnessReliability = lastIssued ? lastIssued.harness_reliability : null;

  const tokens: UiToken[] = (tokensQ.data ?? []).map((t) => ({
    kind:
      t.kind === "validated_fix" ? "fix" : t.kind === "learned_rejection" ? "rej" : "conv",
    date: shortDate(t.created_at),
    summary: t.summary,
  }));

  // Catégories : taux de succès au premier envoi mesuré sur les verdicts réels.
  const uiCategories: UiCategory[] = categories.map((c) => {
    const catIntentions = intentions.filter((i) => i.category_id === c.id);
    const evaluated = catIntentions.filter((i) => firstVerdict.has(i.id));
    const passedFirst = evaluated.filter(
      (i) => firstVerdict.get(i.id)!.outcome === "passed",
    );
    const weeks = new Set(
      evaluated.map((i) => isoWeek(firstVerdict.get(i.id)!.issued_at)),
    ).size;
    return {
      name: c.label,
      mode: c.autonomy as UiCategory["mode"],
      rate: evaluated.length > 0 ? passedFirst.length / evaluated.length : null,
      threshold: Number(c.autonomy_threshold),
      weeks,
    };
  });

  // Courbe : uniquement des points réellement enregistrés.
  const points = curveQ.data ?? [];
  let curve: UiCurve | null = null;
  if (points.length > 0) {
    const weeks = [...new Set(points.map((p) => p.week_iso))].sort();
    const series = (withMemory: boolean) =>
      weeks.map((w) => {
        const p = points.find((x) => x.week_iso === w && x.with_memory === withMemory);
        return p ? Number(p.first_pass_rate) : NaN;
      });
    curve = {
      weeks: weeks.map((w) => w.replace(/^\d{4}-/, "")),
      withMemory: series(true),
      withoutMemory: series(false),
    };
  }

  // KPIs : tous calculés depuis les lignes réelles.
  const now = Date.now();
  const THIRTY_DAYS = 30 * 86400000;
  const passed30d = verdicts.filter(
    (v) => v.outcome === "passed" && now - new Date(v.issued_at).getTime() < THIRTY_DAYS,
  ).length;
  const queued = intentions.filter(
    (i) => i.status === "queued" || i.status === "processing",
  ).length;
  const lastWithMemory = curve
    ? [...curve.withMemory].reverse().find((v) => !Number.isNaN(v))
    : undefined;
  const kpis: UiKpi[] = [
    {
      v: lastWithMemory !== undefined ? `${(lastWithMemory * 100).toFixed(0)}%` : null,
      l: "kpi.firstPassLast",
      em: lastWithMemory !== undefined,
    },
    { v: String(passed30d), l: "kpi.passed30d", em: false },
    { v: String(queued), l: "kpi.queued", em: false },
    { v: String(tokens.length), l: "kpi.tokens", em: false },
  ];

  return {
    mode: "live",
    instance: {
      id: instance.id,
      name: instance.name,
      domain: instance.domain,
      harnessReliability,
    },
    intents,
    tokens,
    categories: uiCategories,
    curve,
    kpis,
  };
}

/* ── Écritures réelles ───────────────────────────────────────────────── */

/** Marque un lot d'intentions vérifiées comme appliquées (envoyées). */
export async function applyIntentions(ids: string[]): Promise<void> {
  if (!supabase) throw new Error("Écriture impossible en mode démo.");
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("intentions")
    .update({ status: "applied" })
    .in("id", ids)
    .eq("status", "verified");
  if (error) throw error;
}

/**
 * Crée l'instance de l'utilisateur (bootstrap) via la fonction SQL
 * `create_instance` — seule voie d'insertion compatible RLS.
 */
export async function createInstance(name: string, domain: string): Promise<string> {
  if (!supabase) throw new Error("Création impossible en mode démo.");
  const { data, error } = await supabase.rpc("create_instance", {
    p_name: name,
    p_domain: domain,
  });
  if (error) throw error;
  return data as string;
}
