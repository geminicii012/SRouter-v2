#!/usr/bin/env python3
"""Migrasi Upstash -> Cloudflare DO Store. Baca .env sendiri (tanpa `source`)."""
import json
import os
import urllib.error
import urllib.request

ROOT = "/home/agentuser/SRouter-work"
DO_URL = "https://srouter-do-store.citedd40.workers.dev"


def load_env():
    env = {}
    for line in open(f"{ROOT}/.env"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
UP_URL = ENV["UPSTASH_REDIS_REST_URL"]
UP_TOKEN = ENV["UPSTASH_REDIS_REST_TOKEN"]
DO_TOKEN = open("/home/agentuser/store_token.txt").read().strip()


def call(url, token, args, timeout=25):
    req = urllib.request.Request(
        url, method="POST", data=json.dumps(args).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "content-type": "application/json",
            # Cloudflare memblokir User-Agent default Python-urllib dengan
            # error 1010 (browser integrity check). UA apa pun selain itu lolos.
            "User-Agent": "srouter-migrate/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.read().decode()[:120]}"}


def up(*a):
    r = call(UP_URL, UP_TOKEN, list(a))
    if r.get("error"):
        raise RuntimeError(r["error"])
    return r.get("result")


def do(*a):
    r = call(DO_URL, DO_TOKEN, list(a))
    if r.get("error"):
        raise RuntimeError(r["error"])
    return r.get("result")


def main():
    print("UP_URL :", UP_URL)
    print("DO_URL :", DO_URL)
    keys = up("KEYS", "srouter:*") or []
    print(f"\n=== MIGRASI {len(keys)} KEY ===\n")

    stats: dict[str, int] = {}
    fails = []

    for k in sorted(keys):
        try:
            t = up("TYPE", k)
            ttl = up("TTL", k) or -1

            if t == "string":
                v = up("GET", k)
                if v is None:
                    continue
                do("SETEX", k, ttl, v) if ttl > 0 else do("SET", k, v)

            elif t == "hash":
                flat = up("HGETALL", k) or []
                for i in range(0, len(flat) - 1, 2):
                    do("HSET", k, flat[i], flat[i + 1])
                if ttl > 0:
                    do("EXPIRE", k, ttl)

            elif t == "list":
                items = up("LRANGE", k, 0, -1) or []
                for item in reversed(items):
                    do("LPUSH", k, item)
                if ttl > 0:
                    do("EXPIRE", k, ttl)

            elif t == "set":
                for m in (up("SMEMBERS", k) or []):
                    do("SADD", k, m)
                if ttl > 0:
                    do("EXPIRE", k, ttl)
            else:
                print(f"  SKIP {k} (tipe {t})")
                continue

            stats[t] = stats.get(t, 0) + 1
        except Exception as e:
            fails.append((k, str(e)[:100]))
            print(f"  FAIL {k}: {str(e)[:100]}")

    print("\n=== HASIL ===")
    for k, v in sorted(stats.items()):
        print(f"  {k:8s}: {v}")
    if fails:
        print(f"  GAGAL  : {len(fails)}")


main()
