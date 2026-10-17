import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LocalSqlite} from '../backend/sqlite.mjs';
import {importBackup,verifiedBackup,summarizeModel} from '../backend/migration.mjs';

export async function verifyArchive(directory){
  const names=(await readdir(directory)).filter(name=>/^potok-backup-.*\.json$/.test(name)).sort();
  if(!names.length)throw new Error('Archive contains no Potok backups.');
  const reports=[];
  for(const name of names){
    const text=await readFile(join(directory,name),'utf8'),db=new LocalSqlite();
    try{
      const backup=await verifiedBackup(text),expected=summarizeModel(backup.data);
      const actual=await importBackup(db,text,'archive-restore-check');
      if(actual.fingerprint!==expected.fingerprint)throw new Error('Restoration mismatch.');
      reports.push({name,createdAt:backup.createdAt,checksum:backup.checksum,...actual});
    }finally{db.close();}
  }
  return {verified:true,count:reports.length,checkedAt:new Date().toISOString(),reports};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const directory=resolve(process.argv[2]||'.local/migration-2026-10-17/archive');
    const result=await verifyArchive(directory);
    await mkdir(resolve(directory,'..'),{recursive:true});
    await writeFile(resolve(directory,'../restore-verification.json'),JSON.stringify(result,null,2)+'\n');
    console.log(`Verified checksums and isolated SQLite restoration: ${result.count}/${result.count} backups. Private report saved beside the archive.`);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
