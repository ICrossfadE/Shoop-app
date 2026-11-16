import { openLocalRepository, type LocalRepository } from '../../src/repository/index.ts';
import { scopeKey } from '../../src/contracts.ts';

const scope = { accountId: '00000000-0000-0000-0000-000000000024', workspaceId: '00000000-0000-0000-0000-000000000024', membershipEpoch: 'browser-test' };
const category = 'local:00000000-0000-0000-0000-000000000001' as const;
const tag = 'local:00000000-0000-0000-0000-000000000002' as const;
const product = 'local:00000000-0000-0000-0000-000000000003' as const;
const expense = 'local:00000000-0000-0000-0000-000000000004' as const;
const serverCategory = '10000000-0000-0000-0000-000000000001';
const serverTag = '10000000-0000-0000-0000-000000000002';
const serverProduct = 'b'.repeat(64);
const serverExpense = '10000000-0000-0000-0000-000000000004';
const occurredAt = '2026-11-05T10:00:00.000Z';
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: Promise<unknown>) { let failed = false; try { await action; } catch { failed = true; } check(failed, 'Expected a rejected transaction'); }

// A native browser versionchange migration runs separately from the Node IndexedDB simulator.
async function migrate(repo: LocalRepository) {
  const before = await repo.load(scope);
  await new Promise<void>((resolve,reject) => {
    const opening = indexedDB.open('shopik-browser-v1',1);
    opening.onupgradeneeded = () => {
      const db=opening.result; db.createObjectStore('workspaces');
      db.createObjectStore('operations',{keyPath:['scopeKey','id']}).createIndex('scope','scopeKey');
      for(const name of ['drafts','snapshots']) db.createObjectStore(name,{keyPath:['scopeKey','key']}).createIndex('scope','scopeKey');
    };
    opening.onerror=()=>reject(opening.error);
    opening.onsuccess=()=>{
      const db=opening.result;const transaction=db.transaction(['workspaces','operations','drafts'],'readwrite');
      transaction.objectStore('workspaces').put(before.workspace,scopeKey(scope));
      for(const op of before.operations) transaction.objectStore('operations').put(op);
      for(const draft of before.drafts) transaction.objectStore('drafts').put({scopeKey:scopeKey(scope),key:draft.key,value:draft.value});
      transaction.oncomplete=()=>{db.close();resolve();};transaction.onabort=()=>reject(transaction.error);
    };
  });
  const upgraded=await openLocalRepository(indexedDB,'shopik-browser-v1');
  const after=await upgraded.load(scope); check(JSON.stringify(after)===JSON.stringify(before),'Native migration changed persisted data');upgraded.close();
}
// First real browser process writes a committed dependency chain and a frozen sending operation.
async function write(repo: LocalRepository) {
  await repo.accept(scope,{kind:'category.create',id:category,name:'Browser category'},{occurredAt});
  await repo.accept(scope,{kind:'tag.create',id:tag,name:'Browser tag',color:'#22633D'},{occurredAt});
  await repo.accept(scope,{kind:'product.save',id:product,categoryId:category,tagIds:[tag],name:'Browser product',description:'',price:'12.50',quantity:'2'},{occurredAt});
  await repo.accept(scope,{kind:'product.complete',items:[{id:product,amount:'24',expenseId:expense}]},{occurredAt});
  const before=await repo.load(scope);
  await rejects(repo.accept(scope,{kind:'category.rename',id:category,name:'Must roll back'},{id:before.operations[0].id}));
  check(JSON.stringify(await repo.load(scope))===JSON.stringify(before),'Native abort left an optimistic projection');
  await repo.beginSend(scope,before.operations[0].id);
  await repo.saveDraft(scope,'draft',{kind:'product',name:'Persisted draft',description:'',price:'1',quantity:'1',categoryId:category,tagIds:[tag]});
  await repo.saveSnapshot(scope,'filter',{productIds:[product],expenseIds:[expense],savedAt:occurredAt});
  await migrate(repo);
  return 'PASS: native IndexedDB write, atomic abort and schema migration';
}
// Second browser process reads the same disk profile and applies canonical mappings transactionally.
async function read(repo: LocalRepository) {
  const before=await repo.load(scope);
  check(before.operations.length===4,'Operations did not survive browser process restart');
  check(before.operations[0].state==='sending','Sending state was replaced after restart');
  check(before.workspace.projection.expenses[expense].planned_amount===25,'Expense plan was not persisted');
  const retry=await repo.beginSend(scope,before.operations[0].id);
  check(retry.wirePayload===before.operations[0].wirePayload && retry.attempts===2,'Retry changed the frozen payload');
  await repo.acknowledge(scope,retry.id,{revision:'r1',mappings:[{kind:'category',localId:category,serverId:serverCategory}],patch:{categories:[{...before.workspace.projection.categories[category],id:serverCategory}]}});
  await repo.beginSend(scope,before.operations[1].id);
  await repo.acknowledge(scope,before.operations[1].id,{revision:'r2',mappings:[{kind:'tag',localId:tag,serverId:serverTag}],patch:{tags:[{...before.workspace.projection.tags[tag],id:serverTag}]}});
  const productOp=await repo.beginSend(scope,before.operations[2].id);
  check(JSON.parse(productOp.wirePayload!).command.categoryId===serverCategory,'Category reference was not resolved');
  let graph=(await repo.load(scope)).workspace.projection;
  await repo.acknowledge(scope,productOp.id,{revision:'r3',mappings:[{kind:'product',localId:product,serverId:serverProduct}],patch:{products:[{...graph.products[product],id:serverProduct,status:'active'}],productTags:[{productId:serverProduct,tagIds:[serverTag]}]}});
  const completion=await repo.beginSend(scope,before.operations[3].id);
  check(JSON.parse(completion.wirePayload!).command.items[0].id===serverProduct,'Product reference was not resolved');
  graph=(await repo.load(scope)).workspace.projection;
  await repo.acknowledge(scope,completion.id,{revision:'r4',mappings:[{kind:'expense',localId:expense,serverId:serverExpense}],patch:{products:[graph.products[serverProduct]],expenses:[{...graph.expenses[expense],id:serverExpense}]}});
  const confirmed=await repo.load(scope); check(confirmed.operations.every(op=>op.state==='acknowledged'),'Missing receipts');
  check(confirmed.drafts[0].value.categoryId===serverCategory,'Draft dependency was not resolved');
  await repo.clearSnapshots(scope);
  check(await repo.loadSnapshot(scope,'filter')===null,'Filter snapshot was not pruned');
  check(JSON.stringify(await repo.load(scope))===JSON.stringify(confirmed),'Pruning removed repository data');
  return 'PASS: native IndexedDB disk restart, frozen retry, ID mapping, receipts and cache isolation';
}
// Headless test automation awaits this promise through DevTools; the normal web app is never loaded.
const result = (async()=>{const repo=await openLocalRepository(indexedDB,'shopik-repository-browser-check');try{return location.hash==='#write'?await write(repo):await read(repo);}finally{repo.close();}})();
Object.assign(window,{repositoryCheck:result});
void result.then(message=>{document.body.textContent=message;},()=>{document.body.textContent='FAIL';});
