import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "build/**",
      "uploads/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // The backend is JS-first and pre-dates strict lint coverage; keep CI
      // unblocked by treating stylistic issues as warnings rather than errors.
      // The Jest test suite is the primary correctness signal.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-prototype-builtins": "warn",
      "no-useless-escape": "warn",
      "no-constant-condition": ["warn", { checkLoops: false }],
      "no-control-regex": "warn",
      "no-async-promise-executor": "warn",
      "no-undef": "error",
    },
  },
];
