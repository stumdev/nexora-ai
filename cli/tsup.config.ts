import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  // core e server (workspace) entram no bundle; dependências de runtime ficam externas
  noExternal: [/^@nexora\//],
});
