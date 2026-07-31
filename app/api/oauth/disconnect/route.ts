import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { loadVault, saveVault } from "@/lib/vault";
import { enforceRateLimit, readJson } from "@/lib/request";
export async function POST(request:NextRequest){try{await enforceRateLimit(request,"oauth-disconnect",20,600);const secret=secretFrom(request),vault=await loadVault(secret),{providerId}=await readJson(request,4096),provider=vault.providers.find(item=>item.id===providerId);if(!provider?.oauth)throw new Error("OAuth tidak ditemukan");delete provider.oauth.accessToken;delete provider.oauth.refreshToken;delete provider.oauth.expiresAt;return NextResponse.json({vault:await saveVault(secret,vault,vault.version)})}catch(error){const message=error instanceof Error?error.message:"error";return NextResponse.json({error:message},{status:message==="RATE_LIMITED"?429:400})}}
