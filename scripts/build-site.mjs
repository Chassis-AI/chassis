/**
 * Génère la landing multilingue depuis apps/site/template.html + i18n/*.json.
 *
 *   /        → français (langue de référence)
 *   /en/ /es/ /zh/ → autres locales
 *
 * Ajouter une langue = ajouter apps/site/i18n/<code>.json et une entrée
 * dans LOCALES. hreflang + canonical générés pour le SEO multilingue.
 * Le build échoue si une clé manque (aucun placeholder ne survit).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = (process.env.SITE_URL ?? "https://chassis-pilote.netlify.app").replace(/\/$/, "");

export const LOCALES = [
  { code: "fr", htmlLang: "fr", label: "FR", path: "/" },
  { code: "en", htmlLang: "en", label: "EN", path: "/en/" },
  { code: "es", htmlLang: "es", label: "ES", path: "/es/" },
  { code: "zh", htmlLang: "zh-Hans", label: "中文", path: "/zh/" },
];

export function buildSite(distDir) {
  const template = readFileSync(join(root, "apps/site/template.html"), "utf8");

  const hreflangLinks = [
    ...LOCALES.map(
      (l) => `<link rel="alternate" hreflang="${l.htmlLang}" href="${SITE_URL}${l.path}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />`,
  ].join("\n");

  for (const locale of LOCALES) {
    const dict = JSON.parse(
      readFileSync(join(root, `apps/site/i18n/${locale.code}.json`), "utf8"),
    );
    const computed = {
      htmlLang: locale.htmlLang,
      canonicalUrl: `${SITE_URL}${locale.path}`,
      hreflangLinks,
      appHref: `${locale.code === "fr" ? "./" : "../"}app/?lang=${locale.code}`,
      langSwitcher: LOCALES.map(
        (l) =>
          `<a href="${l.path}"${l.code === locale.code ? ' class="on"' : ""} hreflang="${l.htmlLang}">${l.label}</a>`,
      ).join(""),
    };

    const page = template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
      const value = computed[key] ?? dict[key];
      if (value === undefined) {
        throw new Error(`Clé i18n manquante : "${key}" (locale ${locale.code})`);
      }
      return value;
    });

    const leftover = page.match(/\{\{[\w.]+\}\}/);
    if (leftover) throw new Error(`Placeholder non résolu : ${leftover[0]}`);

    const outDir = locale.code === "fr" ? distDir : join(distDir, locale.code);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "index.html"), page);
  }
  console.log(`✓ landing générée en ${LOCALES.length} langues (${LOCALES.map((l) => l.code).join(", ")})`);
}

// Exécutable seul : node scripts/build-site.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildSite(join(root, "dist"));
}
