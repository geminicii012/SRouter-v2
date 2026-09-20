import type { NextRequest } from "next/server";
import { handleJsonEndpoint } from "@/lib/handlers";

export const maxDuration = 300;
// paksa runtime Node (edge tidak mendukung aliran yang sama)
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const res = await handleJsonEndpoint(request, "/chat/completions");

  // Header anti-buffer: Next.js `next start` + proxy di depan cenderung
  // menahan Response.stream() sampai selesai. Header ini memaksa aliran.
  const headers = new Headers(res.headers);
  headers.set("X-Accel-Buffering", "no");
  headers.set("Cache-Control", "no-store, no-transform");
  headers.set("Content-Encoding", "identity");
  // biarkan content-type asli (text/event-stream untuk stream)

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
