import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            // The real obsidian package is types-only (no runtime entry), so anything that
            // imports it resolves to this stub; tests either mock the module or never use it.
            obsidian: fileURLToPath(new URL("./tests/stubs/obsidian.ts", import.meta.url)),
        },
    },
});
