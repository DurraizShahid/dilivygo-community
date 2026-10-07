import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // Playwright re-exports `use` for fixtures; ESLint's react-hooks plugin
    // (and the test-setup factory) misclassify it as a React hook call. Keep
    // the rule on for app code, off for tests / e2e.
    files: ["e2e/**/*.{ts,tsx}", "src/test/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react/no-children-prop": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
