import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import config from '../capacitor.config.ts';

// Reject remote entrypoints and a live-server shell before Capacitor copies assets.
assert.equal(config.webDir, 'dist');
assert.equal(config.server?.url, undefined, 'Production must use packaged local files');
assert.equal(config.server?.cleartext, false);
assert.equal(config.server?.androidScheme, 'https');
const html = await readFile(resolve('dist/index.html'), 'utf8');
assert(!/<(?:script|link)[^>]+(?:src|href)=["'](?:https?:)?\/\//i.test(html), 'Remote boot asset');
assert(!/serviceWorker\.register/.test(html), 'Browser offline is out of scope');
for (const file of await readdir(resolve('dist/assets'))) {
  if (!/\.(js|css)$/.test(file)) continue;
  const source = await readFile(resolve('dist/assets', file), 'utf8');
  assert(!/(?:next\/navigation|next\/headers|server-only|node:crypto)/.test(source), `Server dependency: ${file}`);
  assert(!/@import\s+(?:url\()?['"]?https?:/i.test(source), `Remote stylesheet: ${file}`);
}
console.log('PASS: local boot assets and Android runtime boundary');
