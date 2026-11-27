// @ts-check
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export const maxLinesRule = (max) => [
  "error",
  { max, skipBlankLines: true, skipComments: true },
];

export function createWorkspaceEslintConfig({
  ignores = ["eslint.config.mjs"],
  typeChecked = false,
  typeAwareSonarRules = false,
  languageOptions = {},
  extraRules = {},
  specFiles = ["src/**/*.spec.ts"],
  specMaxLines = 450,
  extraConfigs = [],
}) {
  const tsConfigs = typeChecked
    ? tseslint.configs.recommendedTypeChecked
    : tseslint.configs.recommended;
  const enableTypeAwareSonar = typeChecked || typeAwareSonarRules;

  return defineConfig(
    { ignores },
    eslint.configs.recommended,
    ...tsConfigs,
    sonarjs.configs.recommended,
    eslintPluginPrettierRecommended,
    {
      languageOptions,
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "prettier/prettier": ["error", { endOfLine: "auto" }],
        "no-await-in-loop": "error",
        complexity: ["error", 15],
        "max-depth": ["error", 3],
        "max-params": ["error", 7],
        "max-lines": maxLinesRule(300),
        "max-lines-per-function": [
          "error",
          { max: 65, skipBlankLines: true, skipComments: true, IIFEs: true },
        ],
        ...(enableTypeAwareSonar
          ? {
              "require-await": "off",
              "@typescript-eslint/require-await": "error",
              "@typescript-eslint/prefer-includes": "error",
              "@typescript-eslint/prefer-optional-chain": "error",
              "@typescript-eslint/prefer-readonly": "error",
            }
          : {
              "require-await": "error",
            }),
        ...extraRules,
      },
    },
    {
      files: specFiles,
      rules: {
        "max-lines": maxLinesRule(specMaxLines),
        "max-lines-per-function": "off",
        "max-params": "off",
        "no-await-in-loop": "off",
        "sonarjs/assertions-in-tests": "off",
        "sonarjs/function-return-type": "off",
        "sonarjs/no-alphabetical-sort": "off",
        "sonarjs/no-clear-text-protocols": "off",
        "sonarjs/no-hardcoded-ip": "off",
        "sonarjs/no-hardcoded-passwords": "off",
      },
    },
    ...extraConfigs,
  );
}
