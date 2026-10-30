const { createRequire } = require('node:module');
const path = require('node:path');
const compiler = createRequire(path.resolve('shopik-app/package.json'))('typescript');
// Reuse the project's compiler for this isolated browser-test bundle.
module.exports = function(source) {
  return compiler.transpileModule(source, { compilerOptions: {target:compiler.ScriptTarget.ES2022, jsx:compiler.JsxEmit.ReactJSX, module:compiler.ModuleKind.ESNext, esModuleInterop:true} }).outputText;
};
