/**
 * Règles v0 du harness — domaine paie, VERSION DÉMONSTRATEUR.
 *
 * Honnêteté doctrinale : ces règles prouvent le MÉCANISME (verdict ligne à
 * ligne, versionnage, origine declared/learned). Les règles de production
 * seront écrites et calibrées sur les dossiers réels du premier pilote —
 * jamais inventées ici (principe 9).
 */

import type { Candidate, HarnessRule } from "@chassis/core";

interface PayloadPaie {
  client?: string;
  salaireBase?: number;
  primes?: number;
  maintienFin?: string;
  subrogationFin?: string;
}

export interface Proposition {
  assiette?: number;
  maintienFin?: string;
}

export function parseProposition(candidate: Candidate): Proposition | null {
  try {
    const text =
      typeof candidate.content === "string"
        ? candidate.content
        : JSON.stringify(candidate.content);
    const match = text.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as Proposition) : null;
  } catch {
    return null;
  }
}

export const RULES: HarnessRule[] = [
  {
    id: "paie.assiette-primes",
    version: 2,
    origin: "learned",
    description: "L'assiette de cotisations inclut les primes (rejet appris).",
    evaluate(intention, candidate) {
      const p = intention.payload as PayloadPaie;
      const prop = parseProposition(candidate);
      const attendu = (p.salaireBase ?? 0) + (p.primes ?? 0);
      const ok = prop !== null && prop.assiette === attendu;
      return {
        ruleId: "paie.assiette-primes",
        ruleVersion: 2,
        ok,
        detail: ok
          ? `Assiette ${prop!.assiette} € = base + primes.`
          : `Assiette attendue ${attendu} €, proposée ${prop?.assiette ?? "—"}.`,
      };
    },
  },
  {
    id: "ij.subrogation",
    version: 1,
    origin: "declared",
    description: "Le maintien de salaire ne dépasse pas la période de subrogation.",
    evaluate(intention, candidate) {
      const p = intention.payload as PayloadPaie;
      const prop = parseProposition(candidate);
      const fin = prop?.maintienFin ?? p.maintienFin;
      const ok = Boolean(fin && p.subrogationFin && fin <= p.subrogationFin);
      return {
        ruleId: "ij.subrogation",
        ruleVersion: 1,
        ok,
        detail: ok
          ? `Maintien borné au ${fin} (subrogation jusqu'au ${p.subrogationFin}).`
          : `Maintien jusqu'au ${fin ?? "—"} > subrogation ${p.subrogationFin ?? "—"} — rejet probable.`,
      };
    },
  },
];

export const KNOWN_RULE_IDS = new Set(RULES.map((r) => r.id));
