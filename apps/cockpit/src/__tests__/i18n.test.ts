/**
 * Tests i18n du cockpit — l'invariant : aucune langue ne peut être
 * « à moitié traduite ». Les 4 dictionnaires ont exactement les mêmes clés.
 */

import { describe, expect, it } from "vitest";
import { DICTS, LANGS, translate } from "../lib/i18n";

describe("dictionnaires", () => {
  const reference = Object.keys(DICTS.fr).sort();

  it("les 4 langues déclarées existent dans DICTS", () => {
    expect(LANGS.map((l) => l.code).sort()).toEqual(Object.keys(DICTS).sort());
  });

  it.each(Object.keys(DICTS))("la locale %s a exactement les clés du français", (lang) => {
    expect(Object.keys(DICTS[lang as keyof typeof DICTS]).sort()).toEqual(reference);
  });

  it("aucune valeur vide dans aucune langue", () => {
    for (const [lang, dict] of Object.entries(DICTS)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${lang}:${key}`).not.toBe("");
      }
    }
  });
});

describe("translate", () => {
  it("traduit dans la langue demandée", () => {
    expect(translate("fr", "stamp.pass")).toBe("Conforme");
    expect(translate("en", "stamp.pass")).toBe("Compliant");
    expect(translate("zh", "stamp.pass")).toBe("合规");
    expect(translate("es", "stamp.pass")).toBe("Conforme");
  });

  it("remplace les variables {x}, y compris répétées", () => {
    expect(translate("fr", "batch.apply", { n: 3 })).toBe("Valider le lot conforme (3)");
    expect(translate("en", "autonomy.stats", { rate: "98.5", weeks: 9 })).toBe(
      "98.5% verified · 9 wk",
    );
  });

  it("clé inconnue → la clé brute (jamais un crash)", () => {
    expect(translate("fr", "clé.inexistante")).toBe("clé.inexistante");
  });
});
