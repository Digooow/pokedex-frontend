// @ts-check
import globals from 'globals';
import { createWorkspaceEslintConfig, maxLinesRule } from '../../eslint.base.mjs';

export default createWorkspaceEslintConfig({
  ignores: ['dist/**', '.angular/**', 'eslint.config.mjs'],
  languageOptions: { globals: { ...globals.browser, ...globals.node } },
  specFiles: ['src/**/*.spec.ts', 'src/**/*.spec-helper.ts'],
  specMaxLines: 400,
  extraConfigs: [
    {
      files: ['src/**/*.component.ts'],
      rules: { 'max-lines': maxLinesRule(200) },
    },
  ],
});
