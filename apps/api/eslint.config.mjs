// @ts-check
import globals from 'globals';
import {
  createWorkspaceEslintConfig,
  maxLinesRule,
} from '../../eslint.base.mjs';

export default createWorkspaceEslintConfig({
  ignores: ['eslint.config.mjs'],
  typeChecked: true,
  languageOptions: {
    globals: { ...globals.node, ...globals.jest },
    sourceType: 'commonjs',
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  extraRules: {
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn',
  },
  specFiles: ['src/**/*.spec.ts', 'test/**/*.ts'],
  extraConfigs: [
    {
      files: ['src/modules/auth/auth.service.spec.ts'],
      rules: { 'max-lines': maxLinesRule(800) },
    },
  ],
});
