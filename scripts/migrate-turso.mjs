import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {TursoDatabase} from '../backend/turso.mjs';
import {importBackup,verifiedBackup} from '../backend/migration.mjs';

try{
  process.loadEnvFile(resolve('.local/turso.env'));
  const db=new TursoDatabase({url:process.env.TURSO_DATABASE_URL||'',token:process.env.TURSO_AUTH_TOKEN||''});
  const mode=process.argv[2];
  if(mode==='--check'){
    const response=await db.execute({sql:'SELECT 1 AS connected'});
    if(response.rows[0]?.connected!==1)throw new Error('Connection verification failed.');
    console.log('Turso connection verified. No application data changed.');
  }else if(mode==='--import'&&process.argv[3]){
    const backupPath=resolve(process.argv[3]);
    const text=await readFile(backupPath,'utf8');await verifiedBackup(text);
    const statePath=resolve('.local/turso-pending-owner.json');
    let state;
    try{state=JSON.parse(await readFile(statePath,'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;state={accountId:randomUUID(),createdAt:Date.now()};await writeFile(statePath,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});}
    const report=await importBackup(db,text,state.accountId);
    await writeFile(resolve('.local/turso-import-verification.json'),JSON.stringify({accountId:state.accountId,backupPath,...report},null,2)+'\n',{mode:0o600});
    console.log(`Verified import: ${report.sources} sources, ${report.entries} entries, ${report.trash} trashed sources. Owner remains locked until explicitly linked.`);
  }else throw new Error('Use --check, or --import <verified-backup.json>. Requires Node.js 22.16+ (24 recommended).');
}catch(error){console.error(error.message);process.exitCode=1;}
