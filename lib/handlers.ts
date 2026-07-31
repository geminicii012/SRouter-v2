import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { secretFrom } from "./auth";
import { execute } from "./router";
import { loadVault } from "./vault";
import { enforceRateLimit, readJson } from "./request";

function statusFor(message: string) {
  if (message === "RATE_LIMITED") return 429;
  if (message === "PAYLOAD_TOO_LARGE") return 413;
  if (message === "UNAUTHORIZED") return 401;
  return 502;
}

export async function handleJsonEndpoint(
  request: NextRequest,
  path: string,
  fallbackType = "application/json",
) {
  try {
    await enforceRateLimit(
      request,
      "inference",
      Number(process.env.SROUTER_RATE_LIMIT || 600),
      60,
    );
    const secret = secretFrom(request);
    const body = await readJson<any>(request);
    const vault = await loadVault(secret);
    const response = await execute(
      vault,
      body.model,
      path,
      body,
      request.signal,
      secret,
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || fallbackType,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Router error";
    return NextResponse.json(
      { error: { message, type: "srouter_error" } },
      { status: statusFor(message), headers: { "cache-control": "no-store" } },
    );
  }
}
