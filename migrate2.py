#!/usr/bin/env python3
"""Migrasi Upstash Redis -> Cloudflare DO Store. Dijalankan DI VPS."""
import json
import os
import urllib.request

UP_URL = os.environ.get("UPSTASH_REDIS_REST_URL")
UP_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN")
DO_URL = "https://srouter-do-store.citedd40.workers.dev"
DO_TOKEN = open("/home/agentuser/store_token.txt").read().strip()


def call(url, token, args, timeout=25):
    req = urllib.request.Request(
        url, method="POST", data=json.dumps(args).encode(),
        headers={"Authorization": f"Bearer {token}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def up(*a):
    return call(UP_URL, UP_TOKEN, list(a)).get("result")


def do(*a):
    r = call(DO_URL, DO_TOKEN, list(a))
    if r.get("error"):
        raise RuntimeError(r["error"])
    return r.get("result")


def main():
    print("UP_URL:", UP_URL)
    print("DO_URL:", DO_URL)
    keys = up("KEYS", "srouter:*") or []
    print(f"\n=== MIGRASI {len(keys)} KEY ===\n")

    stats = {}
    for k in sorted(keys):
        try:
            t = up("TYPE", k)
            ttl = up("TTL", k)

            if t == "string":
                v = up("GET", k)
                if v is None:
                    continue
                if ttl and ttl > 0:
                    do("SETEX", k, ttl, v)
                else:
                    do("SET", k, v)

            elif t == "hash":
                flat = up("HGETALL", k) or []
                for i in range(0, len(flat) - 1, 2):
                    do("HSET", k, flat[i], flat[i + 1])
                if ttl and ttl > 0:
                    do("EXPIRE", k, ttl)

            elif t == "list":
                items = up("LRANGE", k, 0, -1) or []
                # LRANGE terbaru-dulu; LPUSH terbalik supaya urutan sama
                for item in reversed(items):
                    do("LPUSH", k, item)
                if ttl and ttl > 0:
                    do("EXPIRE", k, ttl)

            elif t == "set":
                for m in (up("SMEMBERS", k) or []):
                    do("SADD", k, m)
                if ttl and ttl > 0:
                    do("EXPIRE", k, ttl)

            else:
                print(f"  SKIP {k} (tipe {t})")
                continue

            stats[t] = stats.get(t, 0) + 1
            print(f"  OK {t:7s} {k}")
        except Exception as e:
            print(f"  FAIL {k}: {e}")

    print("\n=== HASIL ===")
    for k, v in sorted(stats.items()):
        print(f"  {k:8s}: {v}")


main()
