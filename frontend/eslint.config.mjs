import { dirname } from "path";
import { fileURLToPath } from "url";
import nextPlugin from "@next/eslint-plugin-next";
import tanstackQuery from "@tanstack/eslint-plugin-query";
import prettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// NOTE: eslint-config-next ("next/core-web-vitals") cannot be loaded in this
// repo: it hard-depends on typescript-eslint, which crashes on TypeScript 7.0
// (no JS compiler API until TS 7.1; see typescript-eslint#10940). The Next.js
// core rules are wired up directly via @next/eslint-plugin-next instead.
const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    plugins: { "@tanstack/query": tanstackQuery },
    rules: {
      "@tanstack/query/exhaustive-deps": "warn",
      "@tanstack/query/stable-query-client": "warn",
    },
  },
  prettier,
];

export default eslintConfig;
