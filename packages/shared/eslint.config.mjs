// @ts-check
import globals from 'globals';
import { createWorkspaceEslintConfig, maxLinesRule } from '../../eslint.base.mjs';

export default createWorkspaceEslintConfig({
  ignores: ['dist/**', 'eslint.config.mjs'],
  languageOptions: { globals: { ...globals.node } },
  extraConfigs: [
    {
      files: ['src/domain/pokemon-lab.ts'],
      rules: { 'max-lines': maxLinesRule(420) },
    },
  ],
});
