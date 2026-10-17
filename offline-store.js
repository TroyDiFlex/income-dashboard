// Account snapshots and queued edits are committed together. Auth tokens are not stored here.
export class OfflineStore {
  constructor(database){this.db=database;}
  static async open(indexedDB=globalThis.indexedDB){
    if(!indexedDB)throw new Error('Локальное хранилище недоступно.');
    const request=indexedDB.open('potok-offline',1);
    request.onupgradeneeded=()=>{
      request.result.createObjectStore('profiles',{keyPath:'accountId'});
      const changes=request.result.createObjectStore('changes',{keyPath:'id'});
      changes.createIndex('accountId','accountId');
    };
    return new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(new OfflineStore(request.result));
      request.onerror=()=>reject(new Error('Не удалось открыть локальное хранилище.'));
      request.onblocked=()=>reject(new Error('Закройте старые вкладки для обновления хранилища.'));
    });
  }
  transaction(names,mode,run){
    return new Promise((resolve,reject)=>{
      const tx=this.db.transaction(names,mode);let value;
      tx.oncomplete=()=>resolve(value);
      tx.onabort=()=>reject(new Error('Изменения не сохранены на устройстве. Проверьте свободное место.'));
      tx.onerror=()=>{};
      try{run(tx,result=>{value=result;});}catch(error){tx.abort();reject(error);}
    });
  }
  snapshot(accountId){
    return this.transaction(['profiles'],'readonly',(tx,done)=>{
      tx.objectStore('profiles').get(accountId).onsuccess=e=>done(e.target.result||null);
    });
  }
  commitLocal(change,visibleData){
    if(!change.accountId||!change.id)throw new Error('Не определён профиль изменения.');
    return this.transaction(['profiles','changes'],'readwrite',tx=>{
      const profiles=tx.objectStore('profiles');
      profiles.get(change.accountId).onsuccess=e=>{
        const sequence=(e.target.result?.sequence||0)+1;
        tx.objectStore('changes').add({...change,sequence,queuedAt:Date.now()});
        profiles.put({accountId:change.accountId,data:visibleData,sequence,savedAt:Date.now()});
      };
    });
  }
  listChanges(accountId){
    return this.transaction(['changes'],'readonly',(tx,done)=>{
      tx.objectStore('changes').index('accountId').getAll(accountId).onsuccess=e=>done(e.target.result.sort((a,b)=>a.sequence-b.sequence));
    });
  }
  complete(id,accountId){
    return this.transaction(['changes'],'readwrite',tx=>{
      const store=tx.objectStore('changes');
      store.get(id).onsuccess=e=>{if(e.target.result?.accountId===accountId)store.delete(id);};
    });
  }
  close(){this.db.close();}
}
