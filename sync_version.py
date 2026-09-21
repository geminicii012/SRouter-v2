#!/usr/bin/env python3
"""
Sinkronkan kunci `version` dengan versi DI DALAM payload vault.

Masalah: kunci `srouter:<vault>:version` bisa tergeser (mis. oleh skrip
maintenance) tanpa payload vault ikut berubah. Akibatnya saveVault selalu
mengembalikan VERSION_CONFLICT karena current.version (dari payload) != wanted.

Perbaikan: set kunci version = versi yang ada di dalam payload.
"""
import json
import os
import subprocess
import urllib.error
import urllib.request

ROOT = "/home/agentuser/SRouter-work"


def load_env():
    env = {}
    for line in open(f"{ROOT}/.env"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
NS = f"srouter:{ENV.get('SROUTER_VAULT_ID', 'default')}"
SECRET = ENV["SROUTER_INTERNAL_SECRET"]


def store(args):
    url = ENV.get("SROUTER_STORE_URL") or ENV.get("UPSTASH_REDIS_REST_URL")
    tok = ENV.get("SROUTER_STORE_TOKEN") or ENV.get("UPSTASH_REDIS_REST_TOKEN")
    req = urllib.request.Request(
        url, method="POST", data=json.dumps(args).encode(),
        headers={"Authorization": f"Bearer {tok}", "content-type": "application/json",
                 "User-Agent": "srouter-sync/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode()).get("result")
    except urllib.error.HTTPError as e:
        return f"ERR{e.code}"


meta_raw = store(["GET", f"{NS}:meta"])
vault_raw = store(["GET", f"{NS}:vault"])
key_version = store(["GET", f"{NS}:version"])
print("kunci version :", key_version)
print("meta          :", str(meta_raw)[:60])

# baca versi dari dalam payload
NODE = '''
import { decryptJson } from "./lib/crypto.ts";
const meta = JSON.parse(process.env.META_RAW);
const vault = await decryptJson(process.env.VAULT_RAW, process.env.SECRET, meta.salt);
console.log("PAYLOAD_VERSION:" + (vault.version ?? "null"));
console.log("PAYLOAD_PROVIDERS:" + ((vault.providers || []).length));
console.log("PAYLOAD_KEYS:" + ((vault.apiKeys || []).length));
'''
with open(f"{ROOT}/_vsync.mjs", "w") as f:
    f.write(NODE)

r = subprocess.run(
    ["node", "--experimental-strip-types", "./_vsync.mjs"], cwd=ROOT,
    capture_output=True, text=True,
    env={**os.environ, "META_RAW": meta_raw, "VAULT_RAW": vault_raw, "SECRET": SECRET},
    timeout=120,
)
os.remove(f"{ROOT}/_vsync.mjs")

out = r.stdout
pv = [l.split(":")[1] for l in out.split("\n") if l.startswith("PAYLOAD_VERSION:")]
provs = [l.split(":")[1] for l in out.split("\n") if l.startswith("PAYLOAD_PROVIDERS:")]
keys = [l.split(":")[1] for l in out.split("\n") if l.startswith("PAYLOAD_KEYS:")]
print("versi di payload:", pv[0] if pv else "?")
print("provider         :", provs[0] if provs else "?")
print("apiKeys          :", keys[0] if keys else "?")

if pv and str(key_version) != pv[0]:
    print(f"\n!! TIDAK SINKRON: kunci={key_version} payload={pv[0]}")
    res = store(["SET", f"{NS}:version", pv[0]])
    print(f"   perbaiki -> SET version={pv[0]} : {res}")
    print("   verifikasi:", store(["GET", f"{NS}:version"]))
else:
    print("\nSUDAH SINKRON")
