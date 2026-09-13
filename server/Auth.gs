/** Password verification and revocable persistent sessions. */
function equals_(a,b){if(typeof a!=='string'||typeof b!=='string')return false;var diff=a.length^b.length;for(var i=0;i<64;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function sessionKey_(token){return 'session:'+hash_(token+PropertiesService.getScriptProperties().getProperty('AUTH_HASH'));}
function login_(proof){
  var lock=LockService.getScriptLock();if(!lock.tryLock(5000))fail_('BUSY','Сервис занят. Повторите через несколько секунд.');
  try{
    var cache=CacheService.getScriptCache();
    if(cache.get('login-blocked'))fail_('RATE_LIMIT','Слишком много попыток входа. Подождите одну минуту.');
    var expected=PropertiesService.getScriptProperties().getProperty('AUTH_HASH');
    if(typeof proof!=='string'||! /^[0-9a-f]{64}$/.test(proof)||!equals_(hash_(proof),expected)){
      var failures=Number(cache.get('login-failures')||0)+1;
      cache.put('login-failures',String(failures),60);if(failures>=8)cache.put('login-blocked','1',60);
      fail_('AUTH','Неверный пароль.');
    }
    cache.remove('login-failures');
    var data=read_(true),properties=PropertiesService.getScriptProperties(),now=Date.now();
    // Session validity must not depend on an evictable six-hour cache.
    var saved=properties.getProperties();
    Object.keys(saved).forEach(function(key){if(key.indexOf('session:')===0&&!(Number(saved[key])>now))properties.deleteProperty(key);});
    var token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
    var expiresAt=now+SESSION_DURATION_MS_;
    properties.setProperty(sessionKey_(token),String(expiresAt));
    return {token:token,expiresAt:expiresAt,data:data};
  } finally{lock.releaseLock();}
}
function requireSession_(token){
  if(typeof token!=='string'||! /^[0-9a-f]{64}$/.test(token))fail_('SESSION','Сессия закончилась. Войдите снова.');
  var key=sessionKey_(token),properties=PropertiesService.getScriptProperties(),expiresAt=properties.getProperty(key);
  if(expiresAt!==null){
    if(Number(expiresAt)>Date.now())return;
    properties.deleteProperty(key);
  }else if(CacheService.getScriptCache().get(key))return; // Honor sessions issued before this update until they expire.
  fail_('SESSION','Сессия закончилась. Войдите снова.');
}
