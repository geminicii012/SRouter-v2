import type {NextRequest} from "next/server";import{handleJsonEndpoint}from"@/lib/handlers";export async function POST(request:NextRequest){return handleJsonEndpoint(request,"/embeddings")}
