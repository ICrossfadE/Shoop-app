import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

// Package every asset locally; reject accidental Next/server imports at build time.
export default defineConfig({
  base: './',
  build: { target: 'chrome114', sourcemap: false },
  plugins: [{
    name: 'mobile-runtime-boundary',
    resolveId(source) {
      if (builtinModules.includes(source) || /^(next(?:\/|$)|server-only$|node:)/.test(source) || /(?:^|\/)actions(?:\.[cm]?[jt]sx?)?$/.test(source)) {
        throw new Error(`Server dependency in Android bundle: ${source}`);
      }
      return null;
    },
  }],
});
