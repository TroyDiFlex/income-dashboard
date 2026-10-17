import {DatabaseSync} from 'node:sqlite';

export class LocalSqlite {
  constructor(path=':memory:'){
    this.db=new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON');
  }
  execute({sql,args=[]}){
    const stmt=this.db.prepare(sql);
    if(stmt.columns().length)return {rows:stmt.all(...args)};
    const result=stmt.run(...args);return {rows:[],affectedRows:result.changes};
  }
  batch(statements){
    this.db.exec('BEGIN IMMEDIATE');
    try{const results=statements.map(s=>this.execute(s));this.db.exec('COMMIT');return results;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  close(){this.db.close();}
}
