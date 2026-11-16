import { build } from 'vite';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Use the installed Chromium browser and built-in DevTools transport; no new test dependency is needed.
const candidates = [process.env.SHOPIK_TEST_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter((value): value is string => !!value);
let browser: string | undefined;
for (const candidate of candidates) { try { await access(candidate); browser=candidate; break; } catch { /* Try the next installed browser. */ } }
if (!browser) throw new Error('Set SHOPIK_TEST_BROWSER to an installed Chromium executable');
const directory=await mkdtemp(join(tmpdir(),'shopik-idb-'));
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
// Limit every DevTools call and readiness wait so a failed browser cannot hang the checks.
async function browserPass(mode:'write'|'read') {
  const child=spawn(browser!,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+join(directory,'profile'),
    pathToFileURL(join(directory,'check.html')).href+'#'+mode],{stdio:'ignore',windowsHide:true});
  let launchError:Error|undefined;child.on('error',error=>{launchError=error;});
  let socket:WebSocket|undefined;
  try {
    let port=''; const deadline=Date.now()+20000;
    while(Date.now()<deadline) {
      if(launchError) throw launchError;
      try {port=(await readFile(join(directory,'profile','DevToolsActivePort'),'utf8')).split(/\r?\n/)[0];break;}catch{await delay(100);}
    }
    if(!port)throw new Error('Browser debugger did not start');
    let target:{webSocketDebuggerUrl:string}|undefined;
    while(Date.now()<deadline) {
      try {const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json() as {type:string;url:string;webSocketDebuggerUrl:string}[];target=pages.find(page=>page.type==='page'&&page.url.includes('check.html'));if(target)break;}catch{/* Startup is still in progress. */}
      await delay(100);
    }
    if(!target)throw new Error('Test page did not open');
    socket=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve,reject)=>{socket!.addEventListener('open',()=>resolve(),{once:true});socket!.addEventListener('error',()=>reject(new Error('DevTools connection failed')),{once:true});});
    let nextId=0;
    const calls=new Map<number,{resolve(value:unknown):void;reject(error:Error):void}>();
    socket.addEventListener('message',event=>{const response=JSON.parse(String(event.data));const call=calls.get(response.id);if(!call)return;calls.delete(response.id);if(response.error)call.reject(new Error(JSON.stringify(response.error)));else call.resolve(response.result);});
    function command(method:string,params:Record<string,unknown>={}) {
      return new Promise<unknown>((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{calls.delete(id);reject(new Error('DevTools timeout: '+method));},25000);calls.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket!.send(JSON.stringify({id,method,params}));});
    }
    type Evaluation = {exceptionDetails?:{text:string;exception?:{description:string}};result:{value?:string}};
    let result: Evaluation | undefined;
    for (let attempt=0;attempt<20;attempt++) {
      try { result=await command('Runtime.evaluate',{expression:'(async()=>{for(let i=0;i<100&&!window.repositoryCheck;i++)await new Promise(r=>setTimeout(r,50));return await window.repositoryCheck;})()',awaitPromise:true,returnByValue:true}) as Evaluation; break; }
      catch(error) { if(!(error instanceof Error) || !/Execution context was destroyed|Cannot find context/.test(error.message)) throw error; await delay(100); }
    }
    if(!result) throw new Error('Test document never became ready');
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
    if(!result.result.value?.startsWith('PASS:'))throw new Error('No native IndexedDB test result');
    console.log(result.result.value);
    await command('Browser.close').catch(()=>undefined);
  } finally {
    socket?.close();
    for(let attempt=0;attempt<50&&child.exitCode===null;attempt++)await delay(100);
    if(child.exitCode===null)child.kill();
  }
}
try {
  const output=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,target:'chrome114',lib:{entry:resolve('tests/browser/repository-check.ts'),formats:['iife'],name:'ShopikRepositoryCheck'}}});
  const result=Array.isArray(output)?output[0]:output;
  if(!('output' in result))throw new Error('Test bundle unavailable');
  const chunk=result.output.find(item=>item.type==='chunk');if(!chunk||chunk.type!=='chunk')throw new Error('Test script unavailable');
  await writeFile(join(directory,'check.html'),'<!doctype html><html><body>RUNNING<script>'+chunk.code.replaceAll('</script','<\\/script')+'</script></body></html>');
  await browserPass('write');
  // Browser.close flushes the first process profile before a separate process reopens it.
  await rm(join(directory,'profile','DevToolsActivePort'),{force:true});
  await browserPass('read');
} finally {
  // This exact mkdtemp directory must remain under the OS temporary root before recursive removal.
  if(resolve(dirname(directory))!==resolve(tmpdir())||!basename(directory).startsWith('shopik-idb-'))throw new Error('Unsafe temporary cleanup path');
  await rm(directory,{recursive:true,force:true,maxRetries:8,retryDelay:300});
}
