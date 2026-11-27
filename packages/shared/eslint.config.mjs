// @ts-check
import globals from 'globals';
import { createWorkspaceEslintConfig, maxLinesRule } from '../../eslint.base.mjs';

export default createWorkspaceEslintConfig({
  ignores: ['dist/**', 'eslint.config.mjs'],
  typeAwareSonarRules: true,
  languageOptions: {
    globals: { ...globals.node },
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  extraConfigs: [
    {
      files: ['src/domain/pokemon-lab.ts'],
      rules: { 'max-lines': maxLinesRule(420) },
    },
  ],
});
