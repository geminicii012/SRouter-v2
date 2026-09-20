import { NextRequest } from "next/server";

/**
 * Ambil kredensial dari request.
 *
 * Urutan yang didukung:
 *   1. x-router-secret          (Router Secret atau API key)
 *   2. x-api-key                (API key)
 *   3. Authorization: Bearer X  (keduanya)
 *
 * Router Secret dan API key dibedakan dari prefix `sk-srouter-` di handler.
 */
export function secretFrom(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  return (
    req.headers.get("x-router-secret") ||
    req.headers.get("x-api-key") ||
    auth.replace(/^Bearer\s+/i, "") ||
    ""
  );
}
