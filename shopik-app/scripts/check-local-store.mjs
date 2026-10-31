// Real IndexedDB integration in an isolated Edge origin; no Supabase access.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';
const runtime = createRequire(path.join(process.argv[2], 'package.json'));
const { chromium } = runtime('playwright');
const source = ts.transpileModule(fs.readFileSync('lib/local-store.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
  const page = await browser.newPage();
  await page.route('https://shopik.test/**', route => route.fulfill({body:'<!doctype html><title>Storage test</title>',contentType:'text/html'}));
  await page.goto('https://shopik.test/');
  const install = async () => page.addScriptTag({content:'window.exports={};'+source+';window.store=exports.localStore;'});
  await install();
  await page.evaluate(async () => { await store.write('a','["a:w","products"]',{name:'saved'}); await store.write('b','draft:b:w:new',{name:'b'}); });
  await page.reload(); await install();
  const result = await page.evaluate(async () => {
    const restored=await store.read('a','["a:w","products"]');
    const isolated=await store.read('b','["a:w","products"]');
    await store.invalidate('a:w');
    const invalidated=await store.read('a','["a:w","products"]');
    await store.write('a','draft:a:w:new',{name:'unsent'});
    await store.write('a','draft:a:other:new',{name:'keep'});
    await store.clearScope('a:w');
    if((await store.read('a','draft:a:w:new'))!==undefined||(await store.read('a','draft:a:other:new'))?.name!=='keep')throw Error('Scope cleanup crossed workspace boundary');
    await store.prepareScope('a','a:other','join-1');
    await store.prepareScope('a','a:other','join-2');
    if(await store.read('a','draft:a:other:new'))throw Error('Rejoining revived old draft');
    await store.clear('a');
    const cleared=await store.read('a','draft:a:w:new');
    const other=await store.read('b','draft:b:w:new');
    return {restored,isolated:isolated??null,invalidated:invalidated??null,cleared:cleared??null,other};
  });
  assert.deepEqual(result,{restored:{name:'saved'},isolated:null,invalidated:null,cleared:null,other:{name:'b'}});
  console.log('PASS: real IndexedDB reload, account isolation, snapshot invalidation, account cleanup, independent drafts');
 } finally {await browser.close();}
})();
