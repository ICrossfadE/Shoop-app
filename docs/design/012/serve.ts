import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Serve only the three preview assets on loopback; no access to app files or secrets.
const resources = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/preview.js', ['preview.js', 'text/javascript; charset=utf-8']],
]);
createServer(async (request, response) => {
  const resource = resources.get(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
  if (!resource) { response.writeHead(404).end('Not found'); return; }
  try {
    const content = await readFile(fileURLToPath(new URL(resource[0], import.meta.url)));
    response.writeHead(200, { 'Content-Type': resource[1], 'Cache-Control': 'no-store' }).end(content);
  } catch { response.writeHead(503).end('Compile preview.ts first; see README.md.'); }
}).listen(3012, '127.0.0.1', () => { process.stdout.write('Design preview: http://127.0.0.1:3012\n'); });
