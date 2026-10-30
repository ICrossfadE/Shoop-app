import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Build a standalone HTML deliverable with the project's existing TypeScript package.
const requireProject = createRequire(new URL('../../../shopik-app/package.json', import.meta.url));
const { transpileModule, ScriptTarget, ModuleKind } = requireProject('typescript');
const source = await readFile(new URL('preview.ts', import.meta.url), 'utf8');
const template = await readFile(new URL('index.html', import.meta.url), 'utf8');
const result = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.ES2020 } });
await writeFile(new URL('preview.js', import.meta.url), result.outputText);
const standalone = template.replace('<script type="module" src="preview.js"></script>', () => `<script type="module">\n${result.outputText.replace(/<\/script/gi, '<\\/script')}\n</script>`);
await writeFile(new URL('preview.html', import.meta.url), standalone);
process.stdout.write('Built preview.js and standalone preview.html\n');
