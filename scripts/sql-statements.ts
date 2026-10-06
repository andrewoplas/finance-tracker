/** Split PostgreSQL statements without treating quoted bodies/comments as SQL boundaries. */
export function sqlStatements(sql: string): string[] {
 const statements: string[]=[];let start=0,i=0;
 while(i<sql.length){
  if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i+2);i=end<0?sql.length:end+1;continue;}
  if(sql.startsWith('/*',i)){let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}if(depth)throw Error('Unclosed SQL comment');continue;}
  if(sql[i]==="'"||sql[i]==='"'){
   const quote=sql[i];const escaped=quote==="'"&&i>0&&/[eE]/.test(sql[i-1])&&(i<2||!/[\w$]/.test(sql[i-2]));i++;let closed=false;
   while(i<sql.length){if(escaped&&sql[i]==='\\'){i+=2;continue;}if(sql[i]===quote){if(sql[i+1]===quote){i+=2;continue;}i++;closed=true;break;}i++;}if(!closed)throw Error('Unclosed SQL quote');continue;
  }
  if(sql[i]==='$'){const tag=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];if(tag){const end=sql.indexOf(tag,i+tag.length);if(end<0)throw Error('Unclosed SQL dollar quote');i=end+tag.length;continue;}}
  if(sql[i]===';'){statements.push(sql.slice(start,i+1));start=i+1;}i++;
 }
 if(sql.slice(start).trim())statements.push(sql.slice(start));return statements;
}
export function statementCommand(statement:string):string {
 return statement.replace(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g,' ').trim().replace(/;$/,'').trim().toLowerCase();
}
export function stripMigrationTransaction(sql:string):string {
 const statements=sqlStatements(sql);const controls=statements.map((s,i)=>({i,command:statementCommand(s)})).filter(s=>/^(begin|commit|rollback|start transaction|end|abort)(\s|$)/.test(s.command));
 if(!controls.length)return sql;
 const [first,last]=controls;
 const finalMeaningful=statements.findLastIndex(s=>statementCommand(s)!=='');
 if(controls.length!==2||first.i!==0||first.command!=='begin'||last.i!==finalMeaningful||last.command!=='commit')throw Error('Unexpected migration transaction controls');
 return statements.filter((_,i)=>i!==first.i&&i!==last.i).join('');
}
