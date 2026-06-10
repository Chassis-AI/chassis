/**
 * CHASSIS — types fondamentaux.
 *
 * Doctrine encodée dans les types :
 *  - Une intention SANS critère de vérification n'est pas représentable
 *    comme travail exécutable (principe 3 : pas de preuve, pas de tâche).
 *  - La mémoire n'accepte que des verdicts PASSED (principe 2 et 4).
 */

/** Domaine instancié par l'utilisateur (paie, douanes, facturation…). */
export interface Instance {
  id: string;
  name: string;
  /** Vertical déclaré à l'instanciation. */
  domain: string;
  createdAt: string;
}

/** Catégorie de dossier au sein d'une instance. L'autonomie se gère ici. */
export interface Category {
  id: string;
  instanceId: string;
  label: string;
  /** Niveau d'autonomie courant — monte seuil par seuil, jamais d'un coup. */
  autonomy: AutonomyLevel;
  /** Taux de succès vérifié requis pour proposer l'autonomie supérieure. */
  autonomyThreshold: number;
}

export type AutonomyLevel =
  | "shadow" // le système observe et prédit, ne propose rien
  | "copilot" // propose, l'humain valide chaque sortie
  | "auto"; // applique seul — le harness reste la porte avant envoi

/**
 * L'unité de travail. Le critère de vérification est obligatoire :
 * une tâche non vérifiable est refusée à l'admission (status "out_of_scope").
 */
export interface Intention {
  id: string;
  instanceId: string;
  categoryId: string;
  title: string;
  payload: unknown;
  /** Le critère qui rend la tâche prouvable. Sans lui, hors périmètre. */
  criterion: VerificationCriterion | null;
  status: IntentionStatus;
  createdAt: string;
}

export type IntentionStatus =
  | "queued"
  | "processing"
  | "verified" // verdict harness : conforme, prêt
  | "anomaly" // verdict harness : non conforme, correction proposée
  | "out_of_scope" // pas de critère vérifiable — rendu à l'humain
  | "applied" // envoyé / livré
  | "settled"; // verdict institutionnel reçu (boucle fermée)

export interface VerificationCriterion {
  kind: "formal" | "institutional";
  /** Identifiants des règles du harness applicables. */
  ruleIds: string[];
  description: string;
}

/** Une sortie candidate produite par la boucle pour une intention. */
export interface Candidate {
  id: string;
  intentionId: string;
  content: unknown;
  /** Modèle ayant produit le candidat (traçabilité moteur). */
  producedBy: string;
  costUsd: number;
  latencyMs: number;
}

/** Verdict rendu par le harness. La seule porte. */
export interface Verdict {
  id: string;
  candidateId: string;
  intentionId: string;
  outcome: "passed" | "rejected" | "unverifiable";
  /** Justification ligne par ligne — chaque règle évaluée. */
  findings: Finding[];
  /** Fiabilité du harness au moment du verdict (calibration). */
  harnessReliability: number;
  issuedAt: string;
}

export interface Finding {
  ruleId: string;
  ruleVersion: number;
  ok: boolean;
  detail: string;
}

/**
 * Verdict du monde réel (l'institution accepte/rejette).
 * C'est lui qui recalibre le harness — la boucle fermée.
 */
export interface SettlementRecord {
  intentionId: string;
  accepted: boolean;
  motive?: string;
  settledAt: string;
}

/**
 * Jeton de mémoire darwinienne. N'existe QUE si issu d'un verdict
 * passed ou d'un rejet réel transformé en règle apprise.
 */
export interface MemoryToken {
  id: string;
  instanceId: string;
  kind: "validated_fix" | "learned_rejection" | "convention";
  summary: string;
  /** Preuve d'origine : le verdict ou le règlement qui l'a validé. */
  provenance:
    | { type: "verdict"; verdictId: string }
    | { type: "settlement"; intentionId: string };
  /** Révocable : un jeton contredit par le réel est retiré, pas écrasé. */
  revoked: boolean;
  createdAt: string;
}

/** Règle du harness — versionnée, auditable. */
export interface HarnessRule {
  id: string;
  version: number;
  description: string;
  /** Évalue un candidat. Pur, déterministe quand possible. */
  evaluate: (intention: Intention, candidate: Candidate) => Promise<Finding> | Finding;
  /** Origine de la règle : déclarée à l'instanciation ou apprise d'un rejet. */
  origin: "declared" | "learned";
}

/** Point de la courbe — LA métrique (principe 8). */
export interface CurvePoint {
  weekIso: string;
  firstPassRate: number;
  withMemory: boolean;
  sampleSize: number;
}
