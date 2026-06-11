/**
 * Tests du générateur de landing multilingue — l'invariant : aucune locale
 * ne peut sortir incomplète, et les 4 dictionnaires restent alignés.
 *
 *   node --test scripts/build-site.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { buildSite, LOCALES } from "./build-site.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "chassis-site-"));
after(() => rmSync(out, { recursive: true, force: true }));

buildSite(out);

describe("dictionnaires de la landing", () => {
  const ref = Object.keys(
    JSON.parse(readFileSync(join(root, "apps/site/i18n/fr.json"), "utf8")),
  ).sort();

  for (const locale of LOCALES) {
    it(`la locale ${locale.code} a exactement les clés du français`, () => {
      const keys = Object.keys(
        JSON.parse(readFileSync(join(root, `apps/site/i18n/${locale.code}.json`), "utf8")),
      ).sort();
      assert.deepEqual(keys, ref);
    });
  }
});

describe("pages générées", () => {
  it("l'anglais est la locale par défaut (racine)", () => {
    assert.equal(LOCALES.find((l) => l.path === "/")?.code, "en");
  });

  for (const locale of LOCALES) {
    const path =
      locale.path === "/" ? join(out, "index.html") : join(out, locale.code, "index.html");
    const html = readFileSync(path, "utf8");

    it(`${locale.path} : aucun placeholder restant, lang correct`, () => {
      assert.equal(html.match(/\{\{[\w.]+\}\}/), null);
      assert.ok(html.includes(`<html lang="${locale.htmlLang}">`));
    });

    it(`${locale.path} : hreflang complet (4 langues + x-default) et sélecteur actif`, () => {
      assert.equal((html.match(/hreflang=/g) ?? []).length >= LOCALES.length + 1, true);
      assert.ok(html.includes('class="on"'));
    });

    it(`${locale.path} : le lien démo force ?demo=1 et propage la langue`, () => {
      assert.ok(html.includes(`lang=${locale.code}&demo=1`));
    });

    it(`${locale.path} : « Se connecter » force le mode réel (demo=0) et le favicon est déclaré`, () => {
      assert.ok(html.includes(`class="nav-login" href="${locale.path === "/" ? "./" : "../"}app/?lang=${locale.code}&demo=0"`));
      assert.ok(html.includes('rel="icon" type="image/svg+xml" href="/favicon.svg"'));
    });
  }

  it("le mot banni n'apparaît dans aucune page générée", () => {
    for (const locale of LOCALES) {
      const path =
        locale.path === "/" ? join(out, "index.html") : join(out, locale.code, "index.html");
      assert.equal(readFileSync(path, "utf8").toLowerCase().includes("nexus"), false, locale.code);
    }
  });
});
