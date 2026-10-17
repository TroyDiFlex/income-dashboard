import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {GoogleIdentity} from '../backend/google-identity.mjs';
import {normalizeUsername,hashPassword,verifyPassword,randomSecret,secretDigest} from '../backend/credentials.mjs';

test('application passwords have independent random salts and do not require an email address',async()=>{
 const a=await hashPassword('a separate application password'),b=await hashPassword('a separate application password');
 assert.notEqual(a,b);assert.equal(await verifyPassword('a separate application password',a),true);
 assert.equal(await verifyPassword('incorrect password',a),false);assert.equal(await verifyPassword('any password',null),false);
 await assert.rejects(hashPassword('short'));
 assert.equal(normalizeUsername('  User_Name  '),'user_name');assert.throws(()=>normalizeUsername('a@b.com'));
 const token=randomSecret();assert.equal(secretDigest(token).length,64);assert.notEqual(secretDigest(token),secretDigest(randomSecret()));
});
test('Google tokens require the correct signature, issuer, audience, expiry and sign-in nonce',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const now=1800000000000,clientId='test.apps.googleusercontent.com',nonce='a-long-single-use-sign-in-nonce';let fetches=0;
 const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',use:'sig',alg:'RS256'};
 const identity=new GoogleIdentity({clientId,now:()=>now,fetchImpl:async()=>{fetches++;return {ok:true,headers:new Headers({'cache-control':'max-age=3600'}),json:async()=>({keys:[jwk]})};}});
 const claims={iss:'https://accounts.google.com',aud:clientId,sub:'google-stable-subject',iat:now/1000-10,exp:now/1000+600,nonce,email:'display@example.com',email_verified:true};
 const token=(overrides={},key=privateKey)=>{
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url'),payload=Buffer.from(JSON.stringify({...claims,...overrides})).toString('base64url'),input=header+'.'+payload;
  return input+'.'+sign('RSA-SHA256',Buffer.from(input),key).toString('base64url');
 };
 assert.equal((await identity.verifyToken(token(),nonce)).subject,'google-stable-subject');
 assert.equal((await identity.verifyToken(token({email:'another@example.com'}),nonce)).subject,'google-stable-subject');
 assert.equal(fetches,1);
 for(const overrides of [{aud:'another.apps.googleusercontent.com'},{iss:'https://attacker.invalid'},{exp:now/1000},{nonce:'another-nonce'},{sub:''}])await assert.rejects(identity.verifyToken(token(overrides),nonce));
 const forged=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
 await assert.rejects(identity.verifyToken(token({},forged),nonce),/signature/);
});
