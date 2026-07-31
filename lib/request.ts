import type {NextRequest} from "next/server";import{incr,expire}from"./redis";
export function clientIp(r:NextRequest){return(r.headers.get("x-forwarded-for")||r.headers.get("x-real-ip")||"unknown").split(",")[0].trim()}
export async function enforceRateLimit(r:NextRequest,bucket:string,limit=600,windowSeconds=60){const minute=Math.floor(Date.now()/(windowSeconds*1000)),key=`srouter:limit:${bucket}:${clientIp(r)}:${minute}`,n=(await incr(key))||1;if(n===1)await expire(key,windowSeconds+5);if(n>limit)throw new Error("RATE_LIMITED")}
export async function readJson<T=any>(r:NextRequest,maxBytes=2_000_000):Promise<T>{const len=Number(r.headers.get("content-length")||0);if(len>maxBytes)throw new Error("PAYLOAD_TOO_LARGE");return r.json()}
