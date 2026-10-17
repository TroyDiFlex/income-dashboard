import {randomBytes,scrypt as derive,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
const parameters={N:32768,r:8,p:1,maxmem:64*1024*1024};
const validPassword=value=>typeof value==='string'&&value.length>=12&&value.length<=128;

export function normalizeUsername(value){
  const name=typeof value==='string'?value.normalize('NFKC').trim().toLowerCase():'';
  if(!/^[a-z0-9_]{3,32}$/.test(name))throw new Error('Логин: 3–32 латинские буквы, цифры или знак подчёркивания.');
  return name;
}
export async function hashPassword(password){
  if(!validPassword(password))throw new Error('Пароль должен содержать от 12 до 128 символов.');
  const salt=randomBytes(16),key=await scrypt(password,salt,64,parameters);
  return `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password,stored){
  if(typeof password!=='string'||password.length>128)return false;
  const match=typeof stored==='string'&&/^scrypt-v1\$([0-9a-f]{32})\$([0-9a-f]{128})$/.exec(stored);
  // Missing users and malformed hashes still perform the same expensive derivation.
  const salt=match?Buffer.from(match[1],'hex'):Buffer.alloc(16);
  const expected=match?Buffer.from(match[2],'hex'):Buffer.alloc(64);
  const actual=await scrypt(password,salt,64,parameters);
  return timingSafeEqual(actual,expected)&&Boolean(match);
}
export const randomSecret=()=>randomBytes(32).toString('base64url');
export function secretDigest(secret){
  if(typeof secret!=='string'||!secret.length)throw new Error('A nonempty secret is required.');
  return createHash('sha256').update(secret).digest('hex');
}
