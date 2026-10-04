import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // fixtures/ holds snapshots of other repos (including their own test files); never run those.
    exclude: ["node_modules/**", ".next/**", "fixtures/**"],
  },
});
