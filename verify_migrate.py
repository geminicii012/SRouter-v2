#!/usr/bin/env python3
"""Bandingkan data Upstash vs DO Store — pastikan migrasi utuh."""
import json
import urllib.error
import urllib.request

ROOT = "/home/agentuser/SRouter-work"
DO_URL = "https://srouter-do-store.citedd40.workers.dev"
UA = "srouter-migrate/1.0"


def load_env():
    env = {}
    for line in open(f"{ROOT}/.env"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
UP_URL = ENV["UPSTASH_REDIS_REST_URL"]
UP_TOKEN = ENV["UPSTASH_REDIS_REST_TOKEN"]
DO_TOKEN = open("/home/agentuser/store_token.txt").read().strip()


def call(url, token, args):
    req = urllib.request.Request(
        url, method="POST", data=json.dumps(args).encode(),
        headers={"Authorization": f"Bearer {token}",
                 "content-type": "application/json", "User-Agent": UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}"}


up = lambda *a: call(UP_URL, UP_TOKEN, list(a)).get("result")
do = lambda *a: call(DO_URL, DO_TOKEN, list(a)).get("result")

print("=== PERBANDINGAN DATA ===")
keys = up("KEYS", "srouter:*") or []
ok = bad = 0
for k in sorted(keys):
    t = up("TYPE", k)
    if t == "string":
        a, b = up("GET", k), do("GET", k)
    elif t == "hash":
        a, b = sorted(up("HGETALL", k) or []), sorted(do("HGETALL", k) or [])
    elif t == "list":
        a, b = up("LRANGE", k, 0, -1) or [], do("LRANGE", k, 0, -1) or []
    elif t == "set":
        a, b = sorted(up("SMEMBERS", k) or []), sorted(do("SMEMBERS", k) or [])
    else:
        continue
    same = (a == b)
    if same:
        ok += 1
    else:
        bad += 1
        print(f"  BEDA {t:6s} {k}")
        print(f"        UPSTASH: {str(a)[:90]}")
        print(f"        DO     : {str(b)[:90]}")

print(f"\n  COCOK: {ok} | BEDA: {bad} | TOTAL: {ok + bad}")

print("\n=== SPOT-CHECK NILAI PENTING ===")
for k, label in [("srouter:default:version", "version"),
                 ("srouter:default:vault", "vault (panjang)"),
                 ("srouter:default:meta", "meta (salt+verifier)")]:
    a, b = up("GET", k), do("GET", k)
    print(f"  {label:22s} upstash={len(a or '')}B  do={len(b or '')}B  {'SAMA' if a == b else 'BEDA'}")
