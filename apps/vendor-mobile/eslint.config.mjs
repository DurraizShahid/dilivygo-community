import { defineConfig, globalIgnores } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  ...expoConfig,
  {
    rules: {
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
  ]),
]);
