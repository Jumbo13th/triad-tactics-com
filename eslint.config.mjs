import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-plugin-react's version auto-detection ("detect") calls the
    // context.getFilename() API that ESLint 10 removed; pin the version
    // explicitly to skip detection until the plugin supports ESLint 10.
    settings: {
      react: { version: "19" },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-dev/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/*"],
              message: "Import from feature or platform modules instead of '@/lib/*'.",
            },
            {
              group: ["@/components/*"],
              message: "Do not create a generic components layer; place UI in feature modules.",
            },
            {
              group: ["tests/**", "@/tests/**", "**/tests/**"],
              message: "Do not import test code into application code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      // Unused-var tuning (allow underscore-prefixed params in route handlers etc.)
      "@typescript-eslint/no-unused-vars": ["warn", { "args": "after-used", "argsIgnorePattern": "^_", "ignoreRestSiblings": true }],

      // New rules in eslint-plugin-react-hooks v7 that flag pre-existing
      // patterns (props->state sync effects, fetch effects setting a loading
      // flag). Kept visible as warnings until those screens are refactored.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",

      // Formatting hygiene
      "eol-last": ["error", "always"],
      "no-trailing-spaces": "error",
      "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0 }],

      // Tabbing/indentation safety (allow tabs, prevent accidental mixed indentation)
      "no-tabs": "off",
      "no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
    },
  },
  {
    files: ["src/features/**/useCases/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/platform/*"],
              message:
                "Use cases must not import from '@/platform/*'. Inject via ports.ts/deps.ts and pass dependencies in from adapters/deps.",
            },
            {
              group: ["@/components/*"],
              message: "Do not create a generic components layer; place UI in feature modules.",
            },
            {
              group: ["@/lib/*"],
              message: "Import from feature or platform modules instead of '@/lib/*'.",
            },
            {
              group: ["tests/**", "@/tests/**", "**/tests/**"],
              message: "Do not import test code into application code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/platform/db", "@/platform/db/*"],
              message: "Tests should import db helpers from tests/fixtures instead of platform/db.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/fixtures/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
