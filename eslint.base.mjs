// @ts-check
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";

export const maxLinesRule = (max) => [
  "error",
  { max, skipBlankLines: true, skipComments: true },
];

export function createWorkspaceEslintConfig({
  ignores = ["eslint.config.mjs"],
  typeChecked = false,
  languageOptions = {},
  extraRules = {},
  specFiles = ["src/**/*.spec.ts"],
  specMaxLines = 450,
  extraConfigs = [],
}) {
  const tsConfigs = typeChecked
    ? tseslint.configs.recommendedTypeChecked
    : tseslint.configs.recommended;

  return defineConfig(
    { ignores },
    eslint.configs.recommended,
    ...tsConfigs,
    eslintPluginPrettierRecommended,
    {
      languageOptions,
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "prettier/prettier": ["error", { endOfLine: "auto" }],
        complexity: ["error", 15],
        "max-depth": ["error", 3],
        "max-lines": maxLinesRule(300),
        "max-lines-per-function": [
          "error",
          { max: 65, skipBlankLines: true, skipComments: true, IIFEs: true },
        ],
        ...extraRules,
      },
    },
    {
      files: specFiles,
      rules: {
        "max-lines": maxLinesRule(specMaxLines),
        "max-lines-per-function": "off",
      },
    },
    ...extraConfigs,
  );
}
