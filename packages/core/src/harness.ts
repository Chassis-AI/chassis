/**
 * Le harness — la seule porte (principe 2).
 *
 * Trois responsabilités :
 *  1. Rendre un verdict sur chaque candidat (règles versionnées, findings).
 *  2. Se calibrer sur l'historique : tant que sa fiabilité prédictive
 *     n'atteint pas le seuil, le système n'a pas le droit de proposer.
 *  3. Apprendre des verdicts réels (settlements) : chaque rejet
 *     institutionnel devient une règle candidate, nommée et versionnée.
 */

import type {
  Candidate,
  Finding,
  HarnessRule,
  Intention,
  SettlementRecord,
  Verdict,
} from "./types.js";

export interface HarnessOptions {
  /** Fiabilité minimale (sur l'historique) avant toute proposition. */
  reliabilityGate: number;
}

export interface CalibrationCase {
  intention: Intention;
  candidate: Candidate;
  /** Verdict réel connu (historique). */
  actualAccepted: boolean;
}

export class Harness {
  private rules = new Map<string, HarnessRule>();
  private reliability = 0;
  private calibrated = false;

  constructor(private readonly options: HarnessOptions = { reliabilityGate: 0.85 }) {}

  registerRule(rule: HarnessRule): void {
    const existing = this.rules.get(rule.id);
    if (existing && existing.version >= rule.version) {
      throw new Error(
        `Règle ${rule.id} v${rule.version} : une version >= existe déjà (v${existing.version}).`,
      );
    }
    this.rules.set(rule.id, rule);
  }

  get ruleCount(): number {
    return this.rules.size;
  }

  get currentReliability(): number {
    return this.reliability;
  }

  /** Le système a-t-il le droit de proposer ? (mode ombre sinon) */
  get mayPropose(): boolean {
    return this.calibrated && this.reliability >= this.options.reliabilityGate;
  }

  /**
   * Calibration : rejoue l'historique et mesure la concordance
   * entre les verdicts du harness et les verdicts réels.
   */
  async calibrate(history: CalibrationCase[]): Promise<number> {
    if (history.length === 0) {
      this.reliability = 0;
      this.calibrated = false;
      return 0;
    }
    let agreements = 0;
    for (const c of history) {
      const verdict = await this.evaluate(c.intention, c.candidate);
      const predictedAccepted = verdict.outcome === "passed";
      if (predictedAccepted === c.actualAccepted) agreements += 1;
    }
    this.reliability = agreements / history.length;
    this.calibrated = true;
    return this.reliability;
  }

  /** Rend un verdict. Chaque règle applicable produit un finding. */
  async evaluate(intention: Intention, candidate: Candidate): Promise<Verdict> {
    if (!intention.criterion) {
      return this.verdict(intention, candidate, "unverifiable", [
        {
          ruleId: "core.criterion",
          ruleVersion: 1,
          ok: false,
          detail: "Aucun critère de vérification — hors périmètre, rendu à l'humain.",
        },
      ]);
    }

    const findings: Finding[] = [];
    for (const ruleId of intention.criterion.ruleIds) {
      const rule = this.rules.get(ruleId);
      if (!rule) {
        findings.push({
          ruleId,
          ruleVersion: 0,
          ok: false,
          detail: `Règle ${ruleId} introuvable dans le harness.`,
        });
        continue;
      }
      findings.push(await rule.evaluate(intention, candidate));
    }

    const ok = findings.length > 0 && findings.every((f) => f.ok);
    return this.verdict(intention, candidate, ok ? "passed" : "rejected", findings);
  }

  /**
   * Boucle fermée : un verdict institutionnel contredisant le harness
   * est retourné comme « règle à apprendre » (l'appelant la nomme,
   * l'expert la valide, puis registerRule la versionne).
   */
  reconcile(settlement: SettlementRecord, verdict: Verdict): "consistent" | "learn" {
    const predictedAccepted = verdict.outcome === "passed";
    return predictedAccepted === settlement.accepted ? "consistent" : "learn";
  }

  private verdict(
    intention: Intention,
    candidate: Candidate,
    outcome: Verdict["outcome"],
    findings: Finding[],
  ): Verdict {
    return {
      id: `vd_${candidate.id}`,
      candidateId: candidate.id,
      intentionId: intention.id,
      outcome,
      findings,
      harnessReliability: this.reliability,
      issuedAt: new Date().toISOString(),
    };
  }
}
