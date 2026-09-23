import{get,setex,del,incr,hincrby,lpush,ltrim,lrange,hset,hgetall,cas,expire}from"./redis";import{decryptJson,encryptJson,randomB64,sha256}from"./crypto";import{assertSafeRemoteUrl,secureEqual,validateProviderInput}from"./security";import{emptyVault,type Vault}from"./types";
const vaultId=process.env.SROUTER_VAULT_ID||"default",instance=process.env.SROUTER_INSTANCE_ID||"primary",ns=`srouter:${vaultId}`,META=`${ns}:meta`,VAULT=`${ns}:vault`,VERSION=`${ns}:version`;type Meta={salt:string;verifier:string};

export async function isSetup(){return Boolean(await get(META))}
export async function setup(secret:string){if(secret.length<16||secret.length>256)throw new Error("Router Secret harus 16–256 karakter");const salt=randomB64(),v=emptyVault(),meta=JSON.stringify({salt,verifier:await sha256(secret+salt)}),payload=await encryptJson(v,secret,salt);// CAS: pastikan belum ada, lalu tulis meta+vault+version sekaligus.
// DO single-threaded -> atomik, tidak perlu Lua.
const ok=await cas(META,"__NONE__",[[META,meta],[VAULT,payload],[VERSION,"1"]]);if(!ok)throw new Error("SRouter sudah disiapkan");await heartbeat();return v}
export async function loadVault(secret:string){if(!secret)throw new Error("UNAUTHORIZED");const raw=await get(META);if(!raw)throw new Error("SETUP_REQUIRED");const m=JSON.parse(raw)as Meta;if(!secureEqual(await sha256(secret+m.salt),m.verifier))throw new Error("UNAUTHORIZED");const p=await get(VAULT);if(!p)throw new Error("Vault tidak ditemukan");const v=await decryptJson<Vault>(p,secret,m.salt);await heartbeat();return{...v,logLimit:v.logLimit||1000,modelFavorites:v.modelFavorites||[],providers:v.providers.map(p=>({...p,models:p.models||[],capabilities:p.capabilities||["chat"],relays:p.relays||[],modelSync:p.modelSync||{status:"idle",modelsCount:p.models?.length||0},pricing:p.pricing||{default:{mode:"auto"}}})),routes:Object.fromEntries(Object.entries(v.routes||{}).map(([alias,targets])=>[alias,targets.map((target,index)=>({...target,priority:target.priority??index+1,retry:target.retry??0}))]))}}
export async function saveVault(secret:string,v:Vault,expected?:number,opts?:{skipProviderValidation?:boolean}){// Sebagian pemanggil hanya mengubah `apiKeys`/`modelFavorites` dan tidak
// menyentuh provider sama sekali. Validasi provider (DNS lookup host)
// tidak relevan di situ, dan kalau dijalankan justru bisa melumpuhkan
// UI: satu provider ber-URL mati -> seluruh tulis vault ditolak 400,
// sehingga tombol aktif/nonaktif API key terlihat rusak.
if(!opts?.skipProviderValidation){for(const p of v.providers){validateProviderInput(p);await assertSafeRemoteUrl(p.baseUrl);for(const relay of p.relays||[])await assertSafeRemoteUrl(relay.url);if(p.oauth){await assertSafeRemoteUrl(p.oauth.authorizeUrl);await assertSafeRemoteUrl(p.oauth.tokenUrl)}}}if(Object.keys(v.routes).length>500)throw new Error("Terlalu banyak rute");const current=await loadVault(secret),wanted=expected??current.version;if(current.version!==wanted)throw new Error("VERSION_CONFLICT");const m=JSON.parse((await get(META))!)as Meta,next={...v,version:wanted+1,updatedAt:new Date().toISOString()},payload=await encryptJson(next,secret,m.salt);// CAS: tulis hanya jika version masih == wanted (optimistic locking).
const ok=await cas(VERSION,String(wanted),[[VAULT,payload],[VERSION,String(next.version)]]);if(!ok)throw new Error("VERSION_CONFLICT");return next}
export async function nextCounter(id:string){return(await incr(`${ns}:rr:${id}`))||1}export async function setCooldown(id:string,seconds:number){await setex(`${ns}:cool:${id}`,seconds,"1")}export async function isCooling(id:string){return Boolean(await get(`${ns}:cool:${id}`))}
/**
 * Counter usage AKUMULATIF per bulan & per hari.
 *
 * Masalah nyata: total pemakaian dihitung ulang dari daftar log yang dipangkas
 * LTRIM (`srouter:<vault>:logs`), jadi begitu log ke-(logLimit+1) masuk, log
 * tertua terbuang dan total bulanan TURUN — terlihat seperti "reset sendiri".
 *
 * Perbaikan: simpan angka agregat terpisah yang hanya NAIK (HINCRBY), tidak
 * pernah dihitung ulang dari log. Log tetap dipangkas untuk riwayat detail.
 */
const usageKey = (scope: string) => `${ns}:usage:${scope}`;

/** Kunci periode menurut WAKTU LOKAL server (bukan UTC) supaya "hari ini" cocok dgn tampilan. */
function buckets(at: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return { day, month: day.slice(0, 7) };
}

export type UsageIncrement = {
  requests?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  billableUsd?: number;
  unknownCostRequests?: number;
  estimatedUsageRequests?: number;
};

/** TTL: hari disimpan 35 hari, bulan disimpan 400 hari (aman untuk perbandingan tahunan). */
const TTL_DAY = 60 * 60 * 24 * 35;
const TTL_MONTH = 60 * 60 * 24 * 400;

export async function bumpUsage(inc: UsageIncrement, at = new Date()) {
  const { day, month } = buckets(at);
  const fields: [string, number][] = [
    ["requests", inc.requests || 0],
    ["inputTokens", inc.inputTokens || 0],
    ["outputTokens", inc.outputTokens || 0],
    ["totalTokens", inc.totalTokens || 0],
    ["unknownCostRequests", inc.unknownCostRequests || 0],
    ["estimatedUsageRequests", inc.estimatedUsageRequests || 0],
  ];
  const jobs: Promise<unknown>[] = [];
  for (const scope of [day, month]) {
    const key = usageKey(scope);
    for (const [field, value] of fields) {
      if (value) jobs.push(hincrby(key, field, value));
    }
    // billableUsd pecahan -> pakai per-mikro-USD supaya HINCRBY (integer) tetap presisi.
    if (inc.billableUsd) jobs.push(hincrby(key, "billableMicroUsd", Math.round(inc.billableUsd * 1e6)));
    jobs.push(expire(key, scope.length === 7 ? TTL_MONTH : TTL_DAY));
  }
  await Promise.all(jobs);
}

/** Baca bucket agregat; selalu kembalikan bentuk lengkap walau key belum ada. */
export async function readUsageBucket(scope: string) {
  const raw = (await hgetall(usageKey(scope))) || [];
  const map: Record<string, number> = {};
  for (let i = 0; i + 1 < raw.length; i += 2) map[raw[i]] = Number(raw[i + 1]) || 0;
  return map;
}
export async function addLog(x:unknown,limit=1000){await lpush(`${ns}:logs`,JSON.stringify(x));await ltrim(`${ns}:logs`,0,Math.max(10,Math.min(limit,5000))-1)}export async function logs(limit=1000){return((await lrange(`${ns}:logs`,0,Math.max(1,Math.min(limit,5000))-1))||[]).map(x=>JSON.parse(x))}export async function clearLogs(){await del(`${ns}:logs`)}
export async function putOAuthState(state:string,value:string){await setex(`${ns}:oauth:${state}`,600,value)}export async function takeOAuthState(state:string){const k=`${ns}:oauth:${state}`,v=await get(k);if(v)await del(k);return v}
export async function heartbeat(){await hset(`${ns}:instances`,instance,JSON.stringify({id:instance,lastSeen:new Date().toISOString()}));await expire(`${ns}:instances`,86400*30)}export async function instances(){const a=(await hgetall(`${ns}:instances`))||[];const out=[];for(let i=1;i<a.length;i+=2)try{out.push(JSON.parse(a[i]))}catch{}return out}
