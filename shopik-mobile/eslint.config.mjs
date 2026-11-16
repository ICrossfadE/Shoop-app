import webConfig from '../shopik-app/eslint.config.mjs';

// Reuse the installed TypeScript/React lint tooling without adding duplicate packages.
export default [
  ...webConfig,
  { rules: { '@next/next/no-html-link-for-pages': 'off' } },
];
