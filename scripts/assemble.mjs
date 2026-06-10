/**
 * Assemble le site déployable :
 *   dist/            ← landing fr (générée depuis le template + i18n)
 *   dist/{en,es,zh}/ ← landing dans les autres locales
 *   dist/app/        ← apps/cockpit/dist (cockpit buildé, multilingue)
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "./build-site.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "app"), { recursive: true });

buildSite(dist);
cpSync(join(root, "apps/cockpit/dist"), join(dist, "app"), { recursive: true });
// Règle SPA — utile aussi pour les deploys CLI sans netlify.toml.
writeFileSync(join(dist, "_redirects"), "/app/*  /app/index.html  200\n");

console.log("✓ dist/ assemblé (landing multilingue + cockpit sous /app/)");
