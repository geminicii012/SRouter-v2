#!/usr/bin/env python3
"""
Re-enkripsi vault: secret lama -> secret baru, TANPA kehilangan data.

Dijalankan DI VPS (butuh akses lib/crypto.ts + store).
Alur:
  1. Baca meta (salt lama + verifier)
  2. Verifikasi secret lama cocok
  3. Dekripsi vault pakai secret lama
  4. Generate salt baru, enkripsi ulang pakai secret baru
  5. Tulis meta+vault+version baru secara atomik (CAS)
"""
import json
import os
import subprocess
import urllib.error
import urllib.request

ROOT = "/home/agentuser/SRouter-work"
SECRET_LAMA = "boot-test-secret-16chars-xyz"
SECRET_BARU = "sr_H7mP9xQ2Lf8RaK4Vn6TwY1ZdEc5JuBsM"


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


def store(args):
    """Panggil store aktif (DO atau Upstash) sesuai lib/redis.ts."""
    url = ENV.get("SROUTER_STORE_URL") or ENV.get("UPSTASH_REDIS_REST_URL")
    tok = ENV.get("SROUTER_STORE_TOKEN") or ENV.get("UPSTASH_REDIS_REST_TOKEN")
    req = urllib.request.Request(
        url, method="POST", data=json.dumps(args).encode(),
        headers={"Authorization": f"Bearer {tok}", "content-type": "application/json",
                 "User-Agent": "srouter-rekey/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode()).get("result")
    except urllib.error.HTTPError as e:
        return f"ERR{e.code}:{e.read().decode()[:100]}"


# ── crypto: pakai lib/crypto.ts milik proyek lewat node ───────────────────────
NODE = f'''
import {{ decryptJson, encryptJson, randomB64, sha256 }} from "./lib/crypto.ts";
const metaRaw = process.env.META_RAW;
const vaultRaw = process.env.VAULT_RAW;
const oldSecret = process.env.OLD_SECRET;
const newSecret = process.env.NEW_SECRET;

const meta = JSON.parse(metaRaw);
// 1) verifikasi secret lama
const v = await sha256(oldSecret + meta.salt);
if (v !== meta.verifier) {{ console.log("FAIL:verifier"); process.exit(0); }}
// 2) dekripsi
const vault = await decryptJson(vaultRaw, oldSecret, meta.salt);
console.log("OK_VAULT:" + JSON.stringify(vault).length);
// 3) salt baru + enkripsi ulang
const saltBaru = randomB64();
const metaBaru = JSON.stringify({{ salt: saltBaru, verifier: await sha256(newSecret + saltBaru) }});
const payloadBaru = await encryptJson(vault, newSecret, saltBaru);
console.log("META_NEW:" + metaBaru);
console.log("VAULT_NEW:" + payloadBaru);
'''

print("=== 1. baca meta + vault dari store ===")
meta_raw = store(["GET", f"{NS}:meta"])
vault_raw = store(["GET", f"{NS}:vault"])
version = store(["GET", f"{NS}:version"])
print(f"  meta    : {str(meta_raw)[:70]}")
print(f"  vault   : {len(vault_raw) if isinstance(vault_raw, str) else vault_raw} byte")
print(f"  version : {version}")

if not isinstance(meta_raw, str) or not isinstance(vault_raw, str):
    print("GAGAL: tidak bisa baca meta/vault")
    raise SystemExit(1)

# tulis skrip node ke file
with open(f"{ROOT}/_rekey.mjs", "w") as f:
    f.write(NODE)

print("\n=== 2. dekripsi + enkripsi ulang ===")
env2 = {**os.environ, "META_RAW": meta_raw, "VAULT_RAW": vault_raw,
        "OLD_SECRET": SECRET_LAMA, "NEW_SECRET": SECRET_BARU}
r = subprocess.run(["node", "--experimental-strip-types", "./_rekey.mjs"],
                   cwd=ROOT, capture_output=True, text=True, env=env2, timeout=120)
out = r.stdout
if "FAIL:verifier" in out:
    print("  GAGAL: secret lama tidak cocok")
    os.remove(f"{ROOT}/_rekey.mjs")
    raise SystemExit(1)
print("  dekripsi:", [l for l in out.split("\n") if l.startswith("OK_VAULT")])

meta_new = [l[9:] for l in out.split("\n") if l.startswith("META_NEW:")][0]
vault_new = [l[10:] for l in out.split("\n") if l.startswith("VAULT_NEW:")][0]
print(f"  meta baru : {meta_new[:70]}")
print(f"  vault baru: {len(vault_new)} byte")

print("\n=== 3. tulis atomik (CAS version check) ===")
res = store(["CAS", f"{NS}:version", str(version),
             f"{NS}:meta", meta_new,
             f"{NS}:vault", vault_new,
             f"{NS}:version", str(int(version) + 1)])
print(f"  CAS result: {res}  (1 = sukses)")

os.remove(f"{ROOT}/_rekey.mjs")

print("\n=== 4. verifikasi ===")
print(f"  version baru: {store(['GET', f'{NS}:version'])}")
print(f"  meta baru   : {str(store(['GET', f'{NS}:meta']))[:70]}")
