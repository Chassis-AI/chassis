import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", sourcemap: false },
  // Tauri attend un port fixe en dev et des assets relatifs en prod.
  base: "./",
});
