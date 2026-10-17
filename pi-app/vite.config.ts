import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"
import { fileURLToPath } from "node:url";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), powerApps()],
  resolve: {
    // `vite --mode demo` swaps the Dataverse services and the host context for a sanitised, fictional
    // in-memory snapshot (used for recorded product videos). Normal dev/build never includes it.
    alias:
      mode === "demo"
        ? [
            { find: /^(\.\.\/)+generated\/services\/\w+$/, replacement: fileURLToPath(new URL("./src/demo/services.ts", import.meta.url)) },
            { find: /^@microsoft\/power-apps\/app$/, replacement: fileURLToPath(new URL("./src/demo/app.ts", import.meta.url)) },
          ]
        : [],
  },
}));
