/**
 * Mode démo du cockpit : une instance "pôle social / paie" seedée.
 * Aucune métrique fictive présentée comme réelle — l'écran d'accueil
 * du produit affichera les données du client ; ceci est une démo
 * explicitement étiquetée comme telle dans la topbar.
 */

export type StampKind = "pass" | "fail" | "hold" | "idle";

export interface DemoFinding {
  ruleId: string;
  ok: boolean;
  detail: string;
}

export interface DemoIntent {
  id: string;
  title: string;
  category: string;
  stamp: StampKind;
  findings: DemoFinding[];
}

export interface DemoToken {
  kind: "fix" | "rej";
  date: string;
  summary: string;
}

export interface DemoCategory {
  name: string;
  mode: "shadow" | "copilot" | "auto";
  rate: number;
  threshold: number;
  weeks: number;
}

export const INSTANCE = {
  name: "Cabinet Méridien",
  domain: "Pôle social — Paie & déclaratif",
  harnessReliability: 0.93,
};

export const INTENTS: DemoIntent[] = [
  {
    id: "DSN-2841",
    title: "DSN mensuelle — client Aubrac SARL (34 salariés)",
    category: "Paie standard",
    stamp: "pass",
    findings: [
      { ruleId: "paie.plafond-ss", ok: true, detail: "Plafonds de sécurité sociale appliqués (barème en vigueur)." },
      { ruleId: "paie.assiette-cotis", ok: true, detail: "Assiettes de cotisations cohérentes avec les bulletins." },
      { ruleId: "dsn.bloc-21", ok: true, detail: "Blocs individus complets, NIR valides." },
      { ruleId: "memoire.aubrac-prime", ok: true, detail: "Jeton appliqué : la prime d'ancienneté Aubrac entre dans l'assiette (rejet appris 12/05)." },
    ],
  },
  {
    id: "DSN-2842",
    title: "DSN mensuelle — client Vexin Transports (112 salariés)",
    category: "Paie standard",
    stamp: "pass",
    findings: [
      { ruleId: "paie.plafond-ss", ok: true, detail: "Plafonds conformes." },
      { ruleId: "paie.heures-supp", ok: true, detail: "Exonérations heures supplémentaires correctement plafonnées." },
      { ruleId: "dsn.bloc-21", ok: true, detail: "Blocs individus complets." },
    ],
  },
  {
    id: "ARR-0917",
    title: "Arrêt maladie — subrogation client Hôtel des Brumes",
    category: "Absences & IJ",
    stamp: "fail",
    findings: [
      { ruleId: "ij.delai-carence", ok: true, detail: "Carence de 3 jours appliquée." },
      { ruleId: "ij.subrogation", ok: false, detail: "Le maintien de salaire dépasse la période de subrogation déclarée — rejet probable, correction proposée : borner au 14/06." },
    ],
  },
  {
    id: "STC-0454",
    title: "Solde de tout compte — départ M. Reyes (Aubrac SARL)",
    category: "Entrées / Sorties",
    stamp: "fail",
    findings: [
      { ruleId: "stc.indemnite-cp", ok: true, detail: "Indemnité compensatrice de congés payés exacte (méthode du dixième)." },
      { ruleId: "stc.preavis", ok: false, detail: "Indemnité de préavis calculée sur le salaire de base seul — la convention collective inclut la moyenne des primes. Correction proposée." },
    ],
  },
  {
    id: "DSN-2843",
    title: "DSN événementielle — embauche T. N'Diaye (Vexin)",
    category: "Entrées / Sorties",
    stamp: "pass",
    findings: [
      { ruleId: "dpae.delai", ok: true, detail: "DPAE transmise dans le délai légal." },
      { ruleId: "dsn.bloc-30", ok: true, detail: "Contrat conforme à la convention déclarée." },
    ],
  },
  {
    id: "REQ-1188",
    title: "Question client : rupture conventionnelle collective, procédure ?",
    category: "Conseil",
    stamp: "hold",
    findings: [
      { ruleId: "core.criterion", ok: false, detail: "Pas de critère de vérification machine — conseil juridique rendu à l'humain (hors périmètre, par principe)." },
    ],
  },
  {
    id: "PAI-7731",
    title: "Bulletins juin — client Atelier Corso (8 salariés)",
    category: "Paie standard",
    stamp: "idle",
    findings: [],
  },
  {
    id: "PAI-7732",
    title: "Bulletins juin — client Librairie Folium (3 salariés)",
    category: "Paie standard",
    stamp: "idle",
    findings: [],
  },
];

export const TOKENS: DemoToken[] = [
  { kind: "rej", date: "12·05", summary: "Aubrac SARL : la prime d'ancienneté entre dans l'assiette de cotisations — rejet URSSAF appris, règle paie.assiette v3." },
  { kind: "fix", date: "28·05", summary: "Vexin : exonération heures supp plafonnée par salarié, pas par établissement — validé sur 3 cycles." },
  { kind: "rej", date: "04·06", summary: "Hôtel des Brumes : la subrogation expire avant la fin du maintien conventionnel — borner les IJ déclarées." },
  { kind: "fix", date: "06·06", summary: "STC : méthode du dixième retenue par défaut pour l'ICCP sur la CCN HCR — validée 11 fois sans rejet." },
];

export const CATEGORIES: DemoCategory[] = [
  { name: "Paie standard", mode: "auto", rate: 0.985, threshold: 0.98, weeks: 9 },
  { name: "Absences & IJ", mode: "copilot", rate: 0.91, threshold: 0.98, weeks: 6 },
  { name: "Entrées / Sorties", mode: "copilot", rate: 0.96, threshold: 0.98, weeks: 8 },
  { name: "Conseil", mode: "shadow", rate: 0, threshold: 0.98, weeks: 0 },
];

/** Courbe : taux de succès au premier envoi, avec vs sans mémoire. */
export const CURVE = {
  weeks: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12"],
  withMemory: [0.62, 0.64, 0.67, 0.66, 0.71, 0.74, 0.73, 0.78, 0.8, 0.83, 0.84, 0.87],
  withoutMemory: [0.62, 0.63, 0.64, 0.63, 0.65, 0.66, 0.65, 0.67, 0.66, 0.68, 0.67, 0.68],
};

// `l` = clé i18n (libellé traduit dans l'UI ; les valeurs restent des données démo).
export const KPIS = [
  { v: "87%", l: "kpi.firstPassLast", em: true },
  { v: "412", l: "kpi.unitsMonth", em: false },
  { v: "9", l: "kpi.rejAvoided", em: false },
  { v: "31", l: "kpi.tokens", em: false },
];
