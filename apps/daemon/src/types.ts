/**
 * Formats des fichiers ingérés par le daemon.
 *
 * v0 : des JSON déposés dans inbox/ — le connecteur le plus simple qui
 * matérialise le chaînon complet. Les connecteurs réels (export logiciel
 * de paie, boîte mail…) s'extrairont de l'usage du premier pilote
 * (principe 9), pas l'inverse.
 */

/** Un dossier à traiter, déposé dans inbox/. */
export interface DossierFile {
  title: string;
  /** Libellé de catégorie (créée si absente) — l'autonomie se gère par catégorie. */
  category: string;
  payload: unknown;
  /**
   * Règles du harness applicables. Absent ou vide = pas de critère
   * vérifiable → hors périmètre, rendu à l'humain (principe 3).
   */
  ruleIds?: string[];
}

/** Un verdict institutionnel reçu, déposé dans settlements/. */
export interface SettlementFile {
  /** Id de l'intention (uuid en mode Supabase, id local en dry-run). */
  intentionId: string;
  accepted: boolean;
  motive?: string;
}

/** Un cas d'historique pour la calibration, dans history/. */
export interface HistoryFile {
  title: string;
  payload: unknown;
  ruleIds: string[];
  /** La proposition qui avait été envoyée à l'époque. */
  proposition: unknown;
  /** Le verdict réel de l'institution. */
  accepted: boolean;
}

export function parseDossier(raw: string): DossierFile {
  const d = JSON.parse(raw) as Partial<DossierFile>;
  if (!d.title || typeof d.title !== "string") throw new Error("title manquant");
  if (!d.category || typeof d.category !== "string") throw new Error("category manquante");
  if (d.payload === undefined) throw new Error("payload manquant");
  if (d.ruleIds !== undefined && !Array.isArray(d.ruleIds)) throw new Error("ruleIds invalide");
  return d as DossierFile;
}

export function parseSettlement(raw: string): SettlementFile {
  const s = JSON.parse(raw) as Partial<SettlementFile>;
  if (!s.intentionId) throw new Error("intentionId manquant");
  if (typeof s.accepted !== "boolean") throw new Error("accepted manquant");
  return s as SettlementFile;
}

export function parseHistory(raw: string): HistoryFile {
  const h = JSON.parse(raw) as Partial<HistoryFile>;
  if (!h.title || h.payload === undefined || !Array.isArray(h.ruleIds)) {
    throw new Error("cas d'historique invalide (title/payload/ruleIds)");
  }
  if (h.proposition === undefined || typeof h.accepted !== "boolean") {
    throw new Error("cas d'historique invalide (proposition/accepted)");
  }
  return h as HistoryFile;
}
