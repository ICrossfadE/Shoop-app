import ThemeProvider from '../../../shopik-app/app/components/ThemeProvider';
import ThemeToggle from '../../../shopik-app/app/components/ThemeToggle';
import SettingsPanel from '../../../shopik-app/app/components/SettingsPanel';
import type { WorkspaceBoot } from '../../../shopik-app/lib/workspace-boot';
import type { Theme } from '../../../shopik-app/lib/theme';
import { useState } from 'react';
import OrderModal from '../../../shopik-app/app/components/OrderModal';
import AnimatedNumber from '../../../shopik-app/app/components/AnimatedNumber';
import { createRoot } from 'react-dom/client';
import OrderCard from '../../../shopik-app/app/components/OrderCard';
import ExpenseChart from '../../../shopik-app/app/components/ExpenseChart';
import type { TaggedProduct } from '../../../shopik-app/lib/tags';

// Private browser-test entry, bundled locally and never served by Next.js.
const product = { id:'a'.repeat(64), name:'Дуже довга назва продукту '.repeat(5), description:'Опис покупки з кількома деталями', price:99999999.99, status:'active', created_at:new Date().toISOString(), tags:[{ id:'1', name:'Довга назва користувацького тегу '.repeat(3), color:'#E9E0F7' }, {id:'2',name:'Темний тег',color:'#27372C'}] } as TaggedProduct;
const categories = [{ category_id:'a',category_name:'Їжа', total:70,count:2 },{category_id:'b',category_name:'Їжа',total:30,count:1}];
// Local state exercises the real editor without private records or writes.
const boot = { userId:'fixture', email:'long.email.address.for.layout@example.invalid', account:{name:'Тестовий акаунт',avatar_url:''}, workspace:{workspace_id:'fixture',workspace_name:'Мій простір',member_role:'owner'}, categories:[],tags:product.tags,categoriesError:false,tagsError:false,theme:{theme:'light',userId:'fixture',error:false},initialFilter:{kind:'products',category:'',month:'',tags:[]},loadError:false } as WorkspaceBoot;
function Fixture() {
 const [open,setOpen]=useState(false);
 const [amount,setAmount]=useState(10);
 return (<main className="app-main space-y-6">
  <ThemeToggle /><h1>Перевірка компонентів 015</h1><button onClick={() => setOpen(true)}>Відкрити форму</button><button onClick={() => setAmount((value) => value === 10 ? 200 : 10)}>Змінити число</button><div data-number><AnimatedNumber value={amount} /></div>
  <div className="shopping-layout"><aside className="filter-panel">Фільтри</aside><div className="product-cards"><OrderCard product={{...product,id:"b".repeat(64),created_at:"2026-01-01T08:00:00Z"}} pending={false} onEdit={() => {}} onStatus={() => {}} onDelete={() => {}} /><OrderCard product={product} pending={false} onEdit={() => {}} onStatus={() => {}} onDelete={() => {}} /></div></div>
  <ExpenseChart data={{total:800000099.92,categories:[...categories,...Array.from({length:8},(_,i)=>({category_id:`long-${i}`,category_name:"Довга назва історичної категорії ".repeat(3),total:99999999.99,count:42}))],items:[]}} month="2026-10" filtered />
  <ExpenseChart data={{total:0,categories:[{...categories[0],total:0}],items:[]}} month="2026-10" filtered={false} />
<SettingsPanel boot={boot} onChange={() => {}} />
{open && <OrderModal scope="fixture" temporaryId={"a".repeat(64)} userId="fixture" workspaceId="fixture" product={null} categories={[]} tags={product.tags} selectedCategory="" onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />}
</main>);
}

createRoot(document.getElementById('fixture')!).render(<ThemeProvider initial={document.documentElement.dataset.theme as Theme}><Fixture /></ThemeProvider>);
