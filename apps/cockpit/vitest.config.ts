import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom", // supabase.ts lit window/sessionStorage à l'import
    include: ["src/__tests__/**/*.test.ts"],
    // Jamais de client Supabase réel dans les tests unitaires,
    // même si un .env.local est présent sur la machine.
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" },
  },
});
