import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    server: { deps: { inline: [/next-auth/, /@auth\/core/] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // next-auth's ESM build imports "next/server" without an extension,
      // which fails strict Node ESM subpath resolution against Next's
      // extensionless package.json (no "exports" map). Next's own
      // webpack/turbopack resolver tolerates this at build time; Vitest
      // does not, so alias it to the concrete file for tests.
      "next/server": path.resolve(__dirname, "node_modules/next/server.js"),
    },
  },
});
