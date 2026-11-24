import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/encyclopedia.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: false,
  sourcemap: true,
  target: 'es2022',
});
