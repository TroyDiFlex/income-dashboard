import {createPublicKey,verify} from 'node:crypto';
const CERTS='https://www.googleapis.com/oauth2/v3/certs';

// Signature verification runs locally; only public signing keys are fetched from Google.
export class GoogleIdentity {
  constructor({clientId,fetchImpl=fetch,now=()=>Date.now()}){
    if(typeof clientId!=='string'||!clientId.endsWith('.apps.googleusercontent.com'))throw new Error('Configure a Google OAuth client ID.');
    this.clientId=clientId;this.fetch=fetchImpl;this.now=now;this.keys=[];this.expiresAt=0;this.lastFetch=0;
  }
  async signingKey(kid){
    const cached=this.keys.find(key=>key.kid===kid);
    if(cached&&this.expiresAt>this.now())return cached;
    if(this.lastFetch&&this.now()-this.lastFetch<10000)throw new Error('Google signing key is unavailable.');
    this.lastFetch=this.now();
    const response=await this.fetch(CERTS,{redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Google signing keys are unavailable.');
    const body=await response.json();
    if(!Array.isArray(body.keys)||!body.keys.length)throw new Error('Invalid Google signing keys.');
    this.keys=body.keys.filter(k=>k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
    const ttl=Number(/max-age=(\d+)/.exec(response.headers.get('cache-control')||'')?.[1]||300);
    this.expiresAt=this.now()+Math.min(3600,Math.max(30,ttl))*1000;
    const key=this.keys.find(k=>k.kid===kid);if(!key)throw new Error('Unrecognized Google signing key.');return key;
  }
  async verifyToken(token,expectedNonce){
    if(typeof token!=='string'||token.length>16384||!token.split('.').every(part=>/^[A-Za-z0-9_-]+$/.test(part)))throw new Error('Invalid Google token.');
    const parts=token.split('.');if(parts.length!==3)throw new Error('Invalid Google token.');
    let header,claims;
    try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw new Error('Invalid Google token.');}
    if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256)throw new Error('Invalid Google signing algorithm.');
    const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
    if(!audiences.includes(this.clientId)||(audiences.length>1&&claims.azp!==this.clientId)||claims.azp&&claims.azp!==this.clientId)throw new Error('Google token is for another application.');
    if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss))throw new Error('Invalid Google issuer.');
    if(!Number.isSafeInteger(claims.exp)||claims.exp*1000<=this.now()||!Number.isSafeInteger(claims.iat)||claims.iat*1000>this.now()+60000)throw new Error('Expired or invalid Google token.');
    if(typeof expectedNonce!=='string'||expectedNonce.length<20||claims.nonce!==expectedNonce)throw new Error('Google sign-in challenge does not match.');
    if(typeof claims.sub!=='string'||!claims.sub.length||claims.sub.length>255)throw new Error('Missing Google account identifier.');
    const key=createPublicKey({key:await this.signingKey(header.kid),format:'jwk'});
    if(!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url')))throw new Error('Invalid Google signature.');
    // Email is display metadata. Linking and authorization must use issuer + sub.
    return {issuer:'https://accounts.google.com',subject:claims.sub,email:typeof claims.email==='string'?claims.email:null,emailVerified:claims.email_verified===true};
  }
}
