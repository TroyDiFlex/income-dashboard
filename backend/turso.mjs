// Hrana HTTP with conditional batches: commit only when every preceding step succeeded.
// Uses built-in fetch. Never send a database token to the browser.
export function databaseEndpoint(value){
  const url=new URL(value.replace(/^libsql:/,'https:'));
  if(url.protocol!=='https:'||!url.hostname.endsWith('.turso.io')||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/')throw new Error('Expected a Turso database URL.');
  return url.origin+'/v2/pipeline';
}
function argument(value){
  if(value===null)return {type:'null'};
  if(typeof value==='string')return {type:'text',value};
  if(Number.isSafeInteger(value))return {type:'integer',value:String(value)};
  throw new Error('SQL parameters must be strings, safe integers, or null.');
}
const statement=({sql,args=[]})=>({sql,args:args.map(argument),want_rows:true});
const ok=step=>({type:'ok',step});
export function transactionBatch(statements){
  if(!statements.length)throw new Error('Empty transaction.');
  const steps=[{stmt:statement({sql:'BEGIN IMMEDIATE'})}];
  for(const s of statements)steps.push({condition:ok(steps.length-1),stmt:statement(s)});
  const commit=steps.length;
  steps.push({condition:ok(commit-1),stmt:statement({sql:'COMMIT'})});
  steps.push({condition:{type:'and',conds:[ok(0),{type:'not',cond:ok(commit)}]},stmt:statement({sql:'ROLLBACK'})});
  return {steps};
}
function decode(value){
  if(value.type==='null')return null;
  if(value.type==='text')return value.value;
  if(value.type==='integer'){
    const number=Number(value.value);if(!Number.isSafeInteger(number))throw new Error('Database returned an unsafe integer.');return number;
  }
  throw new Error('Unexpected database value type.');
}
function result(value){
  if(!value||!Array.isArray(value.cols)||!Array.isArray(value.rows))throw new Error('Invalid database result.');
  return {rows:value.rows.map(row=>Object.fromEntries(value.cols.map((col,i)=>[col.name,decode(row[i])]))),affectedRows:value.affected_row_count};
}
export class TursoDatabase {
  constructor({url,token,fetchImpl=fetch}){
    this.endpoint=databaseEndpoint(url);
    if(typeof token!=='string'||token.trim().length<20||/\s/.test(token))throw new Error('Save a database token in the private .local/turso.env file.');
    this.token=token;this.fetch=fetchImpl;
  }
  async request(requests){
    let response;
    try{response=await this.fetch(this.endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:JSON.stringify({requests:[...requests,{type:'close'}]}),signal:AbortSignal.timeout(45000)});}
    catch{throw new Error('Turso connection failed. The result of a write may be unknown; verify before retrying.');}
    if(!response.ok)throw new Error(`Turso request failed (HTTP ${response.status}).`);
    let body;try{body=await response.json();}catch{throw new Error('Turso returned invalid JSON.');}
    if(!Array.isArray(body.results)||body.results.length!==requests.length+1||body.results.some(r=>r.type!=='ok'))throw new Error('Turso rejected a database operation.');
    return body.results.slice(0,-1).map(r=>r.response);
  }
  async execute(query){
    const [response]=await this.request([{type:'execute',stmt:statement(query)}]);
    return result(response.result);
  }
  async batch(statements){
    const batch=transactionBatch(statements),commit=batch.steps.length-2;
    const [,response]=await this.request([{type:'execute',stmt:statement({sql:'PRAGMA foreign_keys=ON'})},{type:'batch',batch}]);
    const value=response.result;
    if(!value||!Array.isArray(value.step_results)||!Array.isArray(value.step_errors)||value.step_errors.some(Boolean)||!value.step_results[commit])throw new Error('Turso transaction did not commit. Verify the destination before retrying.');
    return value.step_results.slice(1,commit).map(result);
  }
}
