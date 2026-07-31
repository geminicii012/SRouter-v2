import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { instances, loadVault } from "@/lib/vault";
import { enforceRateLimit } from "@/lib/request";
export async function GET(request:NextRequest){try{await enforceRateLimit(request,"sync",30,60);const vault=await loadVault(secretFrom(request));return NextResponse.json({version:vault.version,updatedAt:vault.updatedAt,instances:await instances()},{headers:{"cache-control":"no-store"}})}catch(error){const message=error instanceof Error?error.message:"error";return NextResponse.json({error:message},{status:message==="RATE_LIMITED"?429:401})}}
