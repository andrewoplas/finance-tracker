import { readCSV, fingerprint } from './import';
import { dateOnly, decimal, minor } from './core';

export const budgetFlowHeaders = ['Date','Amount','Source Currency','Target Currency','Exchange Rate','Budget Book','Source Account','Target Account','Folder','Category','Payee','Tags','Notes','Pending'];
/** Lossless source staging only: account/category ownership and allocation need a verified destination. */
export function stageNativeBudgetFlow(csv: string, from: string, through: string) {
  dateOnly.parse(from); dateOnly.parse(through);
  if(from > through) throw new Error('Invalid date range');
  const [headers,...values] = readCSV(csv);
  if(!headers || headers.length !== budgetFlowHeaders.length || budgetFlowHeaders.some(h=>!headers.includes(h)) || new Set(headers).size!==headers.length) throw new Error('Unsupported native BudgetFlow columns');
  if(values.length>10000) throw new Error('Native export exceeds 10,000 rows');
  const seen = new Map<string,number>();
  return values.map((cells,index)=>{
    if(cells.length!==headers.length) throw new Error(`Column count mismatch at source row ${index+2}`);
    const source=Object.fromEntries(headers.map((h,i)=>[h,cells[i]]));
    const issues:string[]=[];
    // This observed export uses explicit Manila offsets. Other offsets need deliberate conversion.
    const date=source.Date.slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\+0800$/.test(source.Date) || !dateOnly.safeParse(date).success) issues.push('Unsupported source timestamp');
    let signedCents=0;
    try {signedCents=minor(source.Amount.replace(/^-/ ,''))*(source.Amount.startsWith('-')?-1:1);} catch {issues.push('Invalid exact amount');}
    const type=source['Target Account']?'transfer':signedCents<0?'expense':'income';
    if(signedCents===0) issues.push('Zero amount: preserve as source exception');
    if(source['Source Currency']!=='PHP'||source['Target Currency']!=='PHP'||Number(source['Exchange Rate'])!==1) issues.push('Currency conversion requires review');
    if(source.Pending!=='False') issues.push('Pending source transaction');
    if(!source['Source Account'])issues.push('Missing source account');
    if(type==='transfer')issues.push('Map and reconcile both transfer accounts; never count as spending');
    const description=source.Notes || source.Payee || source.Category;
    if(/\b(payment|settlement|transfer|repayment)\b/i.test(description))issues.push('Possible settlement/transfer: confirm classification');
    const key=fingerprint({date,amount:decimal(Math.abs(signedCents)),description,account:source['Source Account'],type});
    const duplicateOf=seen.get(key);
    if(duplicateOf)issues.push(`Possible duplicate of source row ${duplicateOf}; do not silently remove`);
    else seen.set(key,index+2);
    const excluded=date<from||date>through;
    return {sourceRow:index+2,source,date,signedCents,amount:decimal(Math.abs(signedCents)),type,description,account:source['Source Account'],targetAccount:source['Target Account'],category:source.Category,tags:source.Tags,fingerprint:key,duplicateOf,status:excluded?'excluded':issues.length?'exception':'staged',issues:excluded?[`Outside ${from} through ${through}`,...issues]:issues};
  });
}
export function nativeTotals(rows: ReturnType<typeof stageNativeBudgetFlow>) {
  const groups = (key:(r:typeof rows[number])=>string) => {
    const out:Record<string,{rows:number;incomeCents:number;expenseCents:number;transferCents:number}>={};
    for(const row of rows){const g=out[key(row)]??={rows:0,incomeCents:0,expenseCents:0,transferCents:0};g.rows++;if(row.type==='transfer')g.transferCents+=Math.abs(row.signedCents);else if(row.signedCents<0)g.expenseCents-=row.signedCents;else g.incomeCents+=row.signedCents;}
    return out;
  };
  return {months:groups(r=>r.date.slice(0,7)),accounts:groups(r=>r.account),categories:groups(r=>r.category)};
}
