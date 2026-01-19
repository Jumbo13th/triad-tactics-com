import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
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
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
