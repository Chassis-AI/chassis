/**
 * Assemble le site déployable :
 *   dist/            ← apps/site (landing statique)
 *   dist/app/        ← apps/cockpit/dist (cockpit buildé)
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "app"), { recursive: true });

cpSync(join(root, "apps/site/index.html"), join(dist, "index.html"));
cpSync(join(root, "apps/cockpit/dist"), join(dist, "app"), { recursive: true });

console.log("✓ dist/ assemblé (landing + cockpit sous /app/)");
