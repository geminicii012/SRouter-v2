import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { clearLogs, loadVault, logs } from "@/lib/vault";
import { enforceRateLimit } from "@/lib/request";
export async function GET(request:NextRequest){try{await enforceRateLimit(request,"logs",60,60);await loadVault(secretFrom(request));return NextResponse.json({logs:await logs()},{headers:{"cache-control":"no-store"}})}catch(error){const message=error instanceof Error?error.message:"error";return NextResponse.json({error:message},{status:message==="RATE_LIMITED"?429:401})}}
export async function DELETE(request:NextRequest){try{await enforceRateLimit(request,"logs-write",10,60);await loadVault(secretFrom(request));await clearLogs();return NextResponse.json({ok:true})}catch(error){const message=error instanceof Error?error.message:"error";return NextResponse.json({error:message},{status:message==="RATE_LIMITED"?429:401})}}
