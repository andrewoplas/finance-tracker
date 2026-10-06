// Run with Node --import tsx. Real source/output must remain outside the public repository.
import { readFile, writeFile, realpath, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { stageNativeBudgetFlow, nativeTotals } from '../lib/finance/budgetflow-native';
async function main(){
 const [sourceArg,destinationArg,from,through]=process.argv.slice(2);
 if(!sourceArg||!destinationArg||!from||!through)throw Error('Usage: stage-budgetflow SOURCE OUTPUT_DIR YYYY-MM-DD YYYY-MM-DD');
 const repo=await realpath(resolve(import.meta.dirname,'..'));
 const sourcePath=await realpath(sourceArg);
 await mkdir(resolve(destinationArg),{recursive:true,mode:0o700});
 const destination=await realpath(destinationArg);
 for(const path of [sourcePath,destination]){const rel=relative(repo,path);if(!rel.startsWith('..')&&!isAbsolute(rel))throw Error('Real finance files must be outside repository');}
 const bytes=await readFile(sourcePath);const sha256=createHash('sha256').update(bytes).digest('hex');
 const rows=stageNativeBudgetFlow(bytes.toString('utf8'),from,through);
 const included=rows.filter(r=>r.status!=='excluded');
 const manifest={sourceFile:sourcePath,sha256,from,through,sourceRows:rows.length,ytdRows:included.length,stagedRows:rows.filter(r=>r.status==='staged').length,exceptionRows:rows.filter(r=>r.status==='exception').length,excludedRows:rows.filter(r=>r.status==='excluded').length,totals:nativeTotals(included),destination:'Private local staging only; no application ledger imported',requirements:['Verify private authenticated destination','Map owned account and category IDs','Resolve exceptions and possible duplicates','Reconcile opening/closing balances; do not invent opening balances','Confirm personal/shared attribution; source has no split fields','Separate purchase/bill/paid/report dates require source evidence']};
 const id=sha256.slice(0,16); // Same source snapshot cannot be silently restaged/overwritten.
 for(const [name,value] of [[`budgetflow-${id}-rows.json`,rows],[`budgetflow-${id}-manifest.json`,manifest]] as const)await writeFile(resolve(destination,name),JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({manifest:resolve(destination,`budgetflow-${id}-manifest.json`),sourceRows:manifest.sourceRows,ytdRows:manifest.ytdRows,stagedRows:manifest.stagedRows,exceptionRows:manifest.exceptionRows,excludedRows:manifest.excludedRows}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Staging failed');process.exitCode=1;});
