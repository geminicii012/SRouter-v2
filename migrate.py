#!/usr/bin/env python3
"""
Migrasi data Upstash Redis -> Cloudflare DO Store.
Dibaca dari Upstash (REST), ditulis ke Worker DO (REST, protokol sama).
"""
import json
import os
import subprocess
import sys
import urllib.request

UP_URL = None
UP_TOKEN = None
DO_URL = "https://srouter-do-store.citedd40.workers.dev"
DO_TOKEN = open(os.path.expanduser("~/store_token.txt")).read().strip()


def call(url, token, args, timeout=20):
    req = urllib.request.Request(
        url, method="POST",
        data=json.dumps(args).encode(),
        headers={"Authorization": f"Bearer {token}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def up(*args):
    return call(UP_URL, UP_TOKEN, list(args)).get("result")


def do(*args):
    return call(DO_URL, DO_TOKEN, list(args)).get("result")


def type_of(key):
    t = up("TYPE", key)
    return t


def main():
    global UP_URL, UP_TOKEN
    # baca .env dari VPS lewat ssh
    env = subprocess.run(
        ["sshpass", "-e", "ssh",
         "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
         "-o", "ConnectTimeout=60", "-o", "ServerAliveInterval=10",
         "-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no",
         "-p", "51337", "agentuser@bore.pub",
         "grep -E '^(UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN)=' ~/SRouter-work/.env"],
        capture_output=True, text=True,
        env={**os.environ, "SSHPASS": os.environ["SSHPASS"]},
    )
    for line in env.stdout.strip().split("\n"):
        if line.startswith("UPSTASH_REDIS_REST_URL="):
            UP_URL = line.split("=", 1)[1].strip()
        elif line.startswith("UPSTASH_REDIS_REST_TOKEN="):
            UP_TOKEN = line.split("=", 1)[1].strip()
    print("UP_URL:", UP_URL)
    print("DO_URL:", DO_URL)

    keys = up("KEYS", "srouter:*") or []
    print(f"\n=== MIGRASI {len(keys)} KEY ===")

    stats = {"string": 0, "hash": 0, "list": 0, "set": 0, "skip": 0, "fail": 0}

    for k in keys:
        try:
            t = type_of(k)
            if t == "string":
                v = up("GET", k)
                if v is None:
                    stats["skip"] += 1
                    continue
                ttl = up("TTL", k)
                if ttl and ttl > 0:
                    do("SETEX", k, ttl, v)
                else:
                    do("SET", k, v)
                stats["string"] += 1

            elif t == "hash":
                flat = up("HGETALL", k) or []
                for i in range(0, len(flat), 2):
                    do("HSET", k, flat[i], flat[i + 1])
                ttl = up("TTL", k)
                if ttl and ttl > 0:
                    do("EXPIRE", k, ttl)
                stats["hash"] += 1

            elif t == "list":
                items = up("LRANGE", k, 0, -1) or []
                # Upstash LRANGE 0..-1 = terbaru dulu. Kirim terbalik ke LPUSH
                # supaya urutan akhirnya sama.
                for item in reversed(items):
                    do("LPUSH", k, item)
                ttl = up("TTL", k)
                if ttl and ttl > 0:
                    do("EXPIRE", k, ttl)
                stats["list"] += 1

            elif t == "set":
                members = up("SMEMBERS", k) or []
                for m in members:
                    do("SADD", k, m)
                ttl = up("TTL", k)
                if ttl and ttl > 0:
                    do("EXPIRE", k, ttl)
                stats["set"] += 1

            else:
                print(f"  SKIP {k} (tipe {t})")
                stats["skip"] += 1

        except Exception as e:
            print(f"  FAIL {k}: {e}")
            stats["fail"] += 1

    print("\n=== HASIL ===")
    for k, v in stats.items():
        print(f"  {k:8s}: {v}")


if __name__ == "__main__":
    main()
