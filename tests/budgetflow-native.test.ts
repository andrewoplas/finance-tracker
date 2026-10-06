import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stageNativeBudgetFlow,budgetFlowHeaders,nativeTotals} from '../lib/finance/budgetflow-native';
const row=(date='2026-01-02T12:00:00+0800',amount='-12.34',target='',notes='Synthetic lunch')=>[date,amount,'PHP','PHP','1.0','Synthetic book','Synthetic bank',target,'Folder','Food','','Tag',notes,'False'];
const csv=(rows:string[][])=>[budgetFlowHeaders,...rows].map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');
test('native BudgetFlow preserves source, signs, date cutoff, exact totals and duplicate exceptions',()=>{
 const source=csv([row(),row(),row('2026-10-07T00:00:00+0800'),row('2026-01-03T09:00:00+0800','100.0'),row('2026-01-04T09:00:00+0800','0.0'),row('2026-01-05T09:00:00+0800','-20','Synthetic card','Card settlement')]);
 const staged=stageNativeBudgetFlow(source,'2026-01-01','2026-10-06');
 assert.equal(staged[0].source.Notes,'Synthetic lunch');assert.equal(staged[0].amount,'12.34');assert.equal(staged[1].status,'exception');assert.equal(staged[1].duplicateOf,2);assert.equal(staged[2].status,'excluded');assert.equal(staged[3].type,'income');assert.equal(staged[4].status,'exception');assert.equal(staged[5].type,'transfer');assert.equal(staged[5].status,'exception');
 assert.deepEqual(nativeTotals(staged.filter(r=>r.status!=='excluded')).months['2026-01'],{rows:5,incomeCents:10000,expenseCents:2468,transferCents:2000});
});
test('native adapter fails closed for unknown layout and flags timestamp/FX/pending issues',()=>{
 assert.throws(()=>stageNativeBudgetFlow('date,amount\n2026-01-01,1','2026-01-01','2026-10-06'));
 const r=row();r[0]='2026-01-01T00:00:00Z';r[2]='USD';r[13]='True';assert.equal(stageNativeBudgetFlow(csv([r]),'2026-01-01','2026-10-06')[0].issues.length,3);
});
