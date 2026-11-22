// @ts-check
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/**', 'eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      complexity: ['error', 15],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/**/*.spec.ts'],
    rules: {
      'max-lines': ['error', { max: 450, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/domain/pokemon-lab.ts'],
    rules: {
      'max-lines': ['error', { max: 420, skipBlankLines: true, skipComments: true }],
    },
  },
);
