// @ts-check
import globals from 'globals';
import { createWorkspaceEslintConfig, maxLinesRule } from '../../eslint.base.mjs';

export default createWorkspaceEslintConfig({
  ignores: ['dist/**', '.angular/**', 'eslint.config.mjs'],
  typeAwareSonarRules: true,
  languageOptions: {
    globals: { ...globals.browser, ...globals.node },
    parserOptions: {
      projectService: {
        allowDefaultProject: ['cloudflare/*.ts', 'e2e/*.ts', 'playwright.config.ts'],
      },
      tsconfigRootDir: import.meta.dirname,
    },
  },
  specFiles: ['src/**/*.spec.ts', 'src/**/*.spec-helper.ts', 'e2e/**/*.ts', 'playwright.config.ts'],
  specMaxLines: 400,
  extraConfigs: [
    {
      files: ['src/**/*.component.ts'],
      rules: { 'max-lines': maxLinesRule(200) },
    },
    {
      files: ['src/app/core/guards/auth.guard.ts'],
      rules: { 'sonarjs/function-return-type': 'off' },
    },
  ],
});
