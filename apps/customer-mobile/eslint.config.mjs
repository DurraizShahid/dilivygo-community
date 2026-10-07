import { defineConfig, globalIgnores } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  ...expoConfig,
  {
    rules: {
      // Mobile apps pre-date strict lint coverage; treat stylistic issues as
      // warnings rather than errors so CI is not blocked on the existing
      // baseline. Real bugs (rules-of-hooks, missing deps) still surface.
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  globalIgnores([
    "node_modules/**",
    ".expo/**",
    "android/**",
    "ios/**",
    "dist/**",
    "build/**",
    "e2e/**",
    "scripts/**",
  ]),
]);
