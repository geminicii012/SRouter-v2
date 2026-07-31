const enc=new TextEncoder(), dec=new TextDecoder();
function b64(a:Uint8Array){return Buffer.from(a).toString("base64")}
function unb64(s:string){return new Uint8Array(Buffer.from(s,"base64"))}
export function randomB64(bytes=24){return b64(crypto.getRandomValues(new Uint8Array(bytes)))}
export async function sha256(s:string){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))))}
async function key(secret:string,salt:string){const material=await crypto.subtle.importKey("raw",enc.encode(secret),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt:unb64(salt),iterations:210000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
export async function encryptJson(value:unknown,secret:string,salt:string){const iv=crypto.getRandomValues(new Uint8Array(12));const out=await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(secret,salt),enc.encode(JSON.stringify(value)));return JSON.stringify({iv:b64(iv),data:b64(new Uint8Array(out))})}
export async function decryptJson<T>(payload:string,secret:string,salt:string):Promise<T>{const p=JSON.parse(payload);const out=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(p.iv)},await key(secret,salt),unb64(p.data));return JSON.parse(dec.decode(out))}
