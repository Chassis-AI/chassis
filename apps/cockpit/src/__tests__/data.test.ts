/**
 * Tests de la couche données du cockpit — mapping démo, statuts → tampons,
 * helpers de dates. (La source live est couverte par le daemon + l'e2e.)
 */

import { describe, expect, it } from "vitest";
import { isoWeek, loadDemoData, shortDate, STATUS_STAMP } from "../lib/data";
import { DICTS } from "../lib/i18n";

describe("loadDemoData", () => {
  const data = loadDemoData();

  it("est explicitement en mode démo", () => {
    expect(data.mode).toBe("demo");
    expect(data.instance.name).toBe("Cabinet Méridien");
  });

  it("les libellés de KPI sont des clés i18n existantes (pas du texte en dur)", () => {
    for (const kpi of data.kpis) {
      expect(kpi.l, kpi.l).toMatch(/^kpi\./);
      expect(DICTS.fr[kpi.l], kpi.l).toBeDefined();
    }
  });

  it("une catégorie en ombre n'affiche aucun taux (rate null, jamais 0 fictif)", () => {
    const shadow = data.categories.find((c) => c.mode === "shadow");
    expect(shadow).toBeDefined();
    expect(shadow!.rate).toBeNull();
  });

  it("la courbe démo a autant de points que de semaines", () => {
    expect(data.curve).not.toBeNull();
    expect(data.curve!.withMemory).toHaveLength(data.curve!.weeks.length);
    expect(data.curve!.withoutMemory).toHaveLength(data.curve!.weeks.length);
  });
});

describe("STATUS_STAMP — statuts DB → tampons UI", () => {
  it("couvre les 7 statuts du schéma", () => {
    expect(Object.keys(STATUS_STAMP).sort()).toEqual(
      ["anomaly", "applied", "out_of_scope", "processing", "queued", "settled", "verified"].sort(),
    );
  });

  it("mappe la doctrine : vérifié/appliqué/réglé → pass, anomalie → fail, hors périmètre → hold", () => {
    expect(STATUS_STAMP.verified).toBe("pass");
    expect(STATUS_STAMP.applied).toBe("pass");
    expect(STATUS_STAMP.settled).toBe("pass");
    expect(STATUS_STAMP.anomaly).toBe("fail");
    expect(STATUS_STAMP.out_of_scope).toBe("hold");
    expect(STATUS_STAMP.queued).toBe("idle");
  });
});

describe("helpers de dates", () => {
  it("shortDate → JJ·MM", () => {
    expect(shortDate("2026-06-10T12:00:00Z")).toBe("10·06");
  });

  it("isoWeek gère les bords d'année", () => {
    expect(isoWeek("2026-01-01T00:00:00Z")).toBe("2026-W01");
    expect(isoWeek("2024-12-30T00:00:00Z")).toBe("2025-W01");
  });
});
