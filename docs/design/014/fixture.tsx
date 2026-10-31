import { useState } from 'react';
import OrderModal from '../../../shopik-app/app/components/OrderModal';
import AnimatedNumber from '../../../shopik-app/app/components/AnimatedNumber';
import { createRoot } from 'react-dom/client';
import OrderCard from '../../../shopik-app/app/components/OrderCard';
import ExpenseChart from '../../../shopik-app/app/components/ExpenseChart';
import type { TaggedProduct } from '../../../shopik-app/lib/tags';

// Private browser-test entry, bundled locally and never served by Next.js.
const product = { id:'a'.repeat(64), name:'Дуже довга назва продукту '.repeat(5), description:'Опис покупки з кількома деталями', price:99999999.99, status:'active', created_at:'2026-10-30T08:00:00Z', tags:[{ id:'1', name:'Довга назва користувацького тегу '.repeat(3), color:'#E9E0F7' }, {id:'2',name:'Темний тег',color:'#27372C'}] } as TaggedProduct;
const categories = [{ category_id:'a',category_name:'Їжа', total:70,count:2 },{category_id:'b',category_name:'Їжа',total:30,count:1}];
// Local state exercises the real editor without private records or writes.
function Fixture() {
 const [open,setOpen]=useState(false);
 const [amount,setAmount]=useState(10);
 return (<main className="app-main space-y-6">
  <h1>Перевірка компонентів 014</h1><button onClick={() => setOpen(true)}>Відкрити форму</button><button onClick={() => setAmount((value) => value === 10 ? 200 : 10)}>Змінити число</button><div data-number><AnimatedNumber value={amount} /></div>
  <div className="shopping-layout"><aside className="filter-panel">Фільтри</aside><div className="product-rows"><OrderCard product={product} pending={false} onEdit={() => {}} onStatus={() => {}} onDelete={() => {}} /></div></div>
  <ExpenseChart data={{total:100,categories,items:[]}} month="2026-10" filtered />
  <ExpenseChart data={{total:0,categories:[{...categories[0],total:0}],items:[]}} month="2026-10" filtered={false} />
{open && <OrderModal scope="fixture" temporaryId={"a".repeat(64)} userId="fixture" workspaceId="fixture" product={null} categories={[]} tags={product.tags} selectedCategory="" onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />}
</main>);
}

createRoot(document.getElementById('fixture')!).render(<Fixture />);
