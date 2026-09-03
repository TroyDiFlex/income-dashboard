import {CONFIG} from './config.js';
export const SESSION_KEY='potok-session';
export class ApiError extends Error { constructor(message,code){super(message);this.code=code;} }
export class Api {
  token=null;
  constructor(){
    try{
      const saved=JSON.parse(localStorage.getItem(SESSION_KEY));
      if(saved?.apiUrl===CONFIG.apiUrl&&/^[0-9a-f]{64}$/.test(saved.token)&&Number.isFinite(saved.expiresAt)&&saved.expiresAt>Date.now())this.token=saved.token;
      else localStorage.removeItem(SESSION_KEY);
    }catch{/* Storage can be disabled; signing in still works for this page. */}
  }
  clearSession(){
    const token=this.token;this.token=null;
    try{if(JSON.parse(localStorage.getItem(SESSION_KEY))?.token===token)localStorage.removeItem(SESSION_KEY);}catch{}
  }
  async request(action, payload={}, token=this.token) {
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(CONFIG.apiUrl))throw new ApiError('Подключение к Google ещё настраивается. Данные на этом сайте не опубликованы.','SETUP');
    let response;
    try { response=await fetch(CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action,...payload,token}),redirect:'follow',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(45000)}); }
    catch {throw new ApiError('Не удалось связаться с Google. Проверьте интернет и повторите попытку.','NETWORK');}
    if(!response.ok)throw new ApiError('Сервис временно недоступен. Попробуйте ещё раз.','NETWORK');
    let result;try{result=await response.json();}catch{throw new ApiError('Сервер вернул неверный ответ. Проверьте подключение приложения.','CONFIG');}
    if(!result.ok){if(result.code==='SESSION'&&this.token===token)this.clearSession();throw new ApiError(result.message||'Не удалось выполнить действие.',result.code||'SERVER');}
    return result.result;
  }
  async login(password) {
    const auth=await this.request('bootstrap');
    if(typeof auth.salt!=='string'||auth.iterations!==600000)throw new ApiError('Некорректные настройки входа.','CONFIG');
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(auth.salt),iterations:auth.iterations,hash:'SHA-256'},key,256);
    const proof=Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');
    const result=await this.request('login',{proof});
    if(typeof result.token!=='string'||!/^[0-9a-f]{64}$/.test(result.token)||!Number.isFinite(result.expiresAt)||result.expiresAt<=Date.now())throw new ApiError('Некорректный ответ при входе.','CONFIG');
    this.token=result.token;
    try{localStorage.setItem(SESSION_KEY,JSON.stringify({apiUrl:CONFIG.apiUrl,token:result.token,expiresAt:result.expiresAt}));}catch{}
    return result.data;
  }
  read(){return this.request('read');}
  mutate(revision,operation){return this.request('mutate',{revision,operation});}
  async logout(){const token=this.token;this.clearSession();if(token)await this.request('logout',{},token);}
}
