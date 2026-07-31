import {NextRequest} from "next/server";
export function secretFrom(req:NextRequest){const auth=req.headers.get("authorization")||"";return req.headers.get("x-router-secret")||auth.replace(/^Bearer\s+/i,"")}
