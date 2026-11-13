#!/bin/bash
# Deploy GodView Watch — double-click on the Mac (folder: ~/Documents/GodView).
# Uses only curl and python3. Safe to run again: it updates what is already there.
#
# Cloudflare API calls made (all to https://api.cloudflare.com/client/v4):
#   GET  /user/tokens/verify                                  check the token
#   GET  /accounts                                            find the account id
#   GET  /accounts/{acct}/storage/kv/namespaces?per_page=100  find KV "godview-watch"
#   POST /accounts/{acct}/storage/kv/namespaces               create it if missing
#   PUT  /accounts/{acct}/workers/scripts/godview-watch       upload worker (multipart: metadata + worker.js; bindings KV + Workers AI)
#   PUT  /accounts/{acct}/workers/scripts/godview-watch/schedules   cron every 5 minutes
#   GET  /accounts/{acct}/workers/subdomain                   the account's workers.dev name
#   POST /accounts/{acct}/workers/scripts/godview-watch/subdomain   turn on the workers.dev address
#   PUT  /accounts/{acct}/workers/scripts/godview-watch/secrets     WATCH_TOKEN, NTFY_TOPIC, (ANTHROPIC_API_KEY)
# Then: GET https://godview-watch.<sub>.workers.dev/selftest

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_FILE="$DIR/watch/worker.js"
NAME="godview-watch"
API="https://api.cloudflare.com/client/v4"
COMPAT_DATE="2026-11-01"
APP="https://christophergates88.github.io/godview/"
TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

say()  { printf '%s\n' "$*"; }
step() { printf '\n▶ %s\n' "$*"; }
fail() {
  printf '\n✖ %s\n  Tell Claude (copy this window).\n' "$*"
  printf '\nPress Return to close.'; read -r _ || true
  exit 1
}

command -v curl >/dev/null || fail "curl is missing on this Mac."
command -v python3 >/dev/null || fail "python3 is missing on this Mac (install Apple's Command Line Tools)."
[ -f "$WORKER_FILE" ] || fail "I can't find watch/worker.js next to this script (expected $WORKER_FILE)."

kc_get() { security find-generic-password -s "$1" -w 2>/dev/null; }
kc_set() { security add-generic-password -U -s "$1" -a "${USER:-godview}" -w "$2" >/dev/null 2>&1; }

# JSON helper: py 'python expression using j' < response
py() { python3 -c "import json,sys
try:
  j=json.load(sys.stdin)
except Exception:
  j={}
$1"; }

# Call the Cloudflare API. Usage: cf METHOD PATH [json-body-file] -> response in $TMP/out.json
cf() {
  local method="$1" path="$2" body="${3:-}"
  : > "$TMP/out.json"
  local args=(-sS -X "$method" -H @"$TMP/auth.h" -o "$TMP/out.json" -w '%{http_code}')
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' --data-binary @"$body"); fi
  HTTP=$(curl "${args[@]}" "$API$path") || HTTP=000
}
cf_ok() { py 'print("yes" if j.get("success") else "no")' < "$TMP/out.json"; }
cf_err() { py 'e=j.get("errors") or []; print("; ".join(str(x.get("message",x)) for x in e) or "no details")' < "$TMP/out.json"; }
need_ok() { [ "$(cf_ok)" = "yes" ] || fail "$1 (Cloudflare said: $(cf_err), HTTP $HTTP)."; }

say "GodView Watch — deploy"

# ---------------------------------------------------------------- 1. Cloudflare token
step "Cloudflare sign-in"
CF_TOKEN="$(kc_get slope-caddie-cloudflare)"
[ -n "$CF_TOKEN" ] || CF_TOKEN="$(kc_get godview-cloudflare)"
if [ -z "$CF_TOKEN" ]; then
  say "No saved Cloudflare API token found. Paste one (it needs Workers Scripts:Edit, Workers KV Storage:Edit, Account Settings:Read)."
  printf "Token: "; read -rs CF_TOKEN; echo
  [ -n "$CF_TOKEN" ] || fail "No token was entered."
  kc_set godview-cloudflare "$CF_TOKEN" || fail "Could not save the token in the Keychain."
  say "Saved in Keychain as godview-cloudflare."
fi
printf 'Authorization: Bearer %s\n' "$CF_TOKEN" > "$TMP/auth.h"

cf GET /user/tokens/verify
if [ "$(cf_ok)" = "yes" ]; then
  STATUS=$(py 'print(j.get("result",{}).get("status",""))' < "$TMP/out.json")
  [ "$STATUS" = "active" ] || fail "The Cloudflare token is $STATUS, not active."
  say "Token OK."
else
  say "Token check skipped ($(cf_err)); trying the account directly."
fi

# ---------------------------------------------------------------- 2. Account
cf GET "/accounts?per_page=50"
need_ok "I couldn't list your Cloudflare accounts"
ACCT=$(py 'r=j.get("result") or []; print(r[0]["id"] if r else "")' < "$TMP/out.json")
ACCT_NAME=$(py 'r=j.get("result") or []; print(r[0].get("name","") if r else "")' < "$TMP/out.json")
[ -n "$ACCT" ] || fail "This token can't see any Cloudflare account."
say "Account: $ACCT_NAME"

# ---------------------------------------------------------------- 3. KV namespace
step "Storage (KV)"
cf GET "/accounts/$ACCT/storage/kv/namespaces?per_page=100"
need_ok "I couldn't list your KV storage"
KV_ID=$(py 'print(next((n["id"] for n in j.get("result") or [] if n.get("title")=="godview-watch"),""))' < "$TMP/out.json")
if [ -z "$KV_ID" ]; then
  printf '{"title":"godview-watch"}' > "$TMP/kv.json"
  cf POST "/accounts/$ACCT/storage/kv/namespaces" "$TMP/kv.json"
  need_ok "I couldn't create the KV storage"
  KV_ID=$(py 'print(j["result"]["id"])' < "$TMP/out.json")
  say "Created storage godview-watch."
else
  say "Storage godview-watch already exists."
fi

# ---------------------------------------------------------------- 4. Upload the worker
step "Uploading the watch service"
python3 - "$KV_ID" "$COMPAT_DATE" > "$TMP/meta.json" <<'PY'
import json, sys
print(json.dumps({
  "main_module": "worker.js",
  "compatibility_date": sys.argv[2],
  "bindings": [{"type": "kv_namespace", "name": "KV", "namespace_id": sys.argv[1]}, {"type": "ai", "name": "AI"}],
  "keep_bindings": ["secret_text"],
}))
PY
: > "$TMP/out.json"
HTTP=$(curl -sS -X PUT -H @"$TMP/auth.h" -o "$TMP/out.json" -w '%{http_code}' \
  -F "metadata=@$TMP/meta.json;type=application/json" \
  -F "worker.js=@$WORKER_FILE;filename=worker.js;type=application/javascript+module" \
  "$API/accounts/$ACCT/workers/scripts/$NAME") || HTTP=000
need_ok "The upload failed"
say "Uploaded."

printf '[{"cron":"*/5 * * * *"}]' > "$TMP/cron.json"
cf PUT "/accounts/$ACCT/workers/scripts/$NAME/schedules" "$TMP/cron.json"
need_ok "I couldn't set the 5-minute schedule"
say "Runs every 5 minutes."

# ---------------------------------------------------------------- 5. workers.dev address
cf GET "/accounts/$ACCT/workers/subdomain"
SUB=$(py 'print((j.get("result") or {}).get("subdomain",""))' < "$TMP/out.json")
[ -n "$SUB" ] || fail "Your Cloudflare account has no workers.dev name yet. Open Cloudflare > Workers & Pages once to pick one, then run this again."
printf '{"enabled":true}' > "$TMP/sub.json"
cf POST "/accounts/$ACCT/workers/scripts/$NAME/subdomain" "$TMP/sub.json"
need_ok "I couldn't turn on the workers.dev address"
HOST="$NAME.$SUB.workers.dev"
say "Address: https://$HOST"

# ---------------------------------------------------------------- 6. Secrets
step "Secrets"
WATCH_TOKEN="$(kc_get godview-watch-token)"
if [ -z "$WATCH_TOKEN" ]; then
  WATCH_TOKEN=$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')
  kc_set godview-watch-token "$WATCH_TOKEN" || fail "Could not save the watch token in the Keychain."
  say "Made a new private key for the app (Keychain: godview-watch-token)."
fi
NTFY_TOPIC="$(kc_get godview-ntfy-topic)"
if [ -z "$NTFY_TOPIC" ]; then
  NTFY_TOPIC="godview-$(python3 -c 'import secrets; print(secrets.token_hex(12))')"
  kc_set godview-ntfy-topic "$NTFY_TOPIC" || fail "Could not save the ntfy topic in the Keychain."
  say "Made a new private ntfy topic (Keychain: godview-ntfy-topic)."
fi

put_secret() {
  # The value goes through a pipe (printf is built in), never on a command line.
  printf '%s' "$2" | python3 -c 'import json,sys; print(json.dumps({"name": sys.argv[1], "text": sys.stdin.read(), "type": "secret_text"}))' "$1" > "$TMP/secret.json"
  cf PUT "/accounts/$ACCT/workers/scripts/$NAME/secrets" "$TMP/secret.json"
  rm -f "$TMP/secret.json"
  need_ok "I couldn't save the secret $1"
}
put_secret WATCH_TOKEN "$WATCH_TOKEN"
put_secret NTFY_TOPIC "$NTFY_TOPIC"
AKEY="$(kc_get godview-anthropic)"
if [ -n "$AKEY" ]; then put_secret ANTHROPIC_API_KEY "$AKEY"; say "AI for the brief and camera checks: Claude (your Anthropic key)."; else say "AI for the brief and camera checks: Cloudflare Workers AI (built in, no key needed)."; fi
say "Camera checks stay off until you turn them on for a place in the app (at most 50 pictures a day)."
say "Secrets saved."

# ---------------------------------------------------------------- 7. Self-test
step "Testing the watch service"
printf 'Authorization: Bearer %s\n' "$WATCH_TOKEN" > "$TMP/watch.h"
OK=""
for i in 1 2 3 4 5 6 7 8; do
  CODE=$(curl -sS -H @"$TMP/watch.h" -o "$TMP/self.json" -w '%{http_code}' "https://$HOST/selftest" 2>/dev/null) || CODE=000
  if [ "$CODE" = "200" ]; then OK=1; break; fi
  sleep 5
done
[ -n "$OK" ] || fail "The watch service did not answer its self-test (HTTP $CODE). It can take a minute to appear; run this again."
python3 - "$TMP/self.json" <<'PY'
import json, sys
j = json.load(open(sys.argv[1]))
checks = j.get("checks", [])
good = [c for c in checks if c.get("ok")]
names = {"alerts": "weather alerts", "storms": "storm reports", "quakes": "earthquakes", "fires": "wildfires", "rivers": "rivers",
         "squawk": "aircraft emergencies", "aircraft": "aircraft overhead", "tropical": "hurricanes", "air": "air quality",
         "aurora": "aurora", "iss": "space station passes", "launch": "rocket launches"}
print(f"{len(good)} of {len(checks)} checks working.")
for c in checks:
    if not c.get("ok"):
        print(f"  - {names.get(c['id'], c['id'])}: not working yet ({c.get('error')})")
PY

# ---------------------------------------------------------------- 8. What to do next
LINK="${APP}#watch=${WATCH_TOKEN}@${HOST}"
cat <<EOF

✔ Done. GodView Watch is running every 5 minutes.

(a) Phone alerts: in the ntfy app tap "+", Subscribe to topic, type exactly:
    $NTFY_TOPIC
    (leave the server as ntfy.sh). Keep this topic private.

(b) Connect GodView: open this link once on each device (iPhone and Mac):
    $LINK
    It saves the key on that device and removes it from the address bar.
EOF
printf '\nPress Return to send a test alert to your phone (or close this window).'
if read -r _; then
  CODE=$(curl -sS -X POST -H @"$TMP/watch.h" -o "$TMP/tn.json" -w '%{http_code}' "https://$HOST/test-notify") || CODE=000
  if [ "$CODE" = "200" ]; then say "Test alert sent. If nothing arrived, check the topic name in ntfy."; else say "The test alert failed (HTTP $CODE). Tell Claude."; fi
fi
