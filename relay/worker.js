function privateHost(hostname) {
  return hostname === "localhost" || hostname.endsWith(".local") ||
    /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return Response.json({ service: "SRouter Relay", version: "1.0.0", ok: true });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 25_000_000) return new Response("Payload too large", { status: 413 });

    if (request.headers.get("x-srouter-relay-secret") !== env.RELAY_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const target = request.headers.get("x-srouter-target");
    if (!target) return new Response("Missing target", { status: 400 });

    let url;
    try { url = new URL(target); }
    catch { return new Response("Invalid target", { status: 400 }); }

    const allowed = new Set((env.ALLOWED_HOSTS || "").split(",").map(x => x.trim()).filter(Boolean));
    if (url.protocol !== "https:" || privateHost(url.hostname) || !allowed.has(url.hostname)) {
      return new Response("Target denied", { status: 403 });
    }

    const headers = new Headers(request.headers);
    headers.delete("x-srouter-target");
    headers.delete("x-srouter-relay-secret");
    headers.delete("host");
    headers.delete("cookie");
    headers.delete("cf-connecting-ip");
    headers.delete("x-forwarded-for");
    headers.delete("x-real-ip");

    const upstream = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("set-cookie");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  },
};
