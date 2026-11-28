// @ts-check
import globals from 'globals';
import { createWorkspaceEslintConfig } from '../../eslint.base.mjs';

export default createWorkspaceEslintConfig({
  ignores: ['dist/**', 'eslint.config.mjs', 'tsup.config.ts'],
  typeAwareSonarRules: true,
  languageOptions: {
    globals: { ...globals.node },
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
