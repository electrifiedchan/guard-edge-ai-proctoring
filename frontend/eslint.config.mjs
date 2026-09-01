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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored MediaPipe bundle — Google's own minified FaceMesh code, not ours.
    // Linting it produces hundreds of meaningless warnings, so we skip public/.
    "public/**",
  ]),
  // Next 16's preset promoted several style/advisory rules to build-breaking
  // ERRORS. This code predates that and is type-clean (`tsc --noEmit` passes),
  // so we keep these as visible warnings rather than let them fail the build:
  //   - no-explicit-any / ban-ts-comment: the untyped MediaPipe interop needs them
  //   - react-hooks/{set-state-in-effect,immutability,purity}: React Compiler
  //     advisories, and the compiler is not enabled (see next.config.ts)
  //   - no-unescaped-entities: cosmetic JSX-text nag
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
