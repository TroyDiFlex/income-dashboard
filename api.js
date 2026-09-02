import {CONFIG} from './config.js';
export class ApiError extends Error { constructor(message,code){super(message);this.code=code;} }
export class Api {
  token=null;
  async request(action, payload={}) {
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(CONFIG.apiUrl))throw new ApiError('Подключение к Google ещё настраивается. Данные на этом сайте не опубликованы.','SETUP');
    let response;
    try { response=await fetch(CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action,...payload,token:this.token}),redirect:'follow',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(45000)}); }
    catch {throw new ApiError('Не удалось связаться с Google. Проверьте интернет и повторите попытку.','NETWORK');}
    if(!response.ok)throw new ApiError('Сервис временно недоступен. Попробуйте ещё раз.','NETWORK');
    let result;try{result=await response.json();}catch{throw new ApiError('Сервер вернул неверный ответ. Проверьте подключение приложения.','CONFIG');}
    if(!result.ok)throw new ApiError(result.message||'Не удалось выполнить действие.',result.code||'SERVER');
    return result.result;
  }
  async login(password) {
    const auth=await this.request('bootstrap');
    if(typeof auth.salt!=='string'||auth.iterations!==600000)throw new ApiError('Некорректные настройки входа.','CONFIG');
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(auth.salt),iterations:auth.iterations,hash:'SHA-256'},key,256);
    const proof=Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');
    const result=await this.request('login',{proof});this.token=result.token;return result.data;
  }
  read(){return this.request('read');}
  mutate(revision,operation){return this.request('mutate',{revision,operation});}
  async logout(){try{if(this.token)await this.request('logout');}finally{this.token=null;}}
}
