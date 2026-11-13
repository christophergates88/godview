#!/bin/bash
# Runs "Deploy GodView Watch.command" against fake `security` and `curl`
# commands (no network), then checks the exact Cloudflare calls it made.
# Usage: bash server/test/deploy-mock.sh [fresh|again|badtoken]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SERVER="$(cd "$HERE/.." && pwd)"
MODE="${1:-fresh}"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
mkdir -p "$W/bin" "$W/kc"
export MOCK_DIR="$W" MOCK_MODE="$MODE"
[ "$MODE" = "again" ] && { printf 'cf-token-123' > "$W/kc/slope-caddie-cloudflare"; printf 'EXISTING_TOKEN_abc' > "$W/kc/godview-watch-token"; printf 'godview-existingtopic' > "$W/kc/godview-ntfy-topic"; printf 'sk-ant-x' > "$W/kc/godview-anthropic"; }
[ "$MODE" = "badtoken" ] && printf 'bad' > "$W/kc/slope-caddie-cloudflare"

cat > "$W/bin/security" <<'S'
#!/bin/bash
# fake macOS Keychain: find-generic-password -s NAME -w | add-generic-password -U -s NAME -a A -w VALUE
cmd="$1"; shift; name=""; val=""
while [ $# -gt 0 ]; do case "$1" in -s) name="$2"; shift 2;; -w) if [ $# -ge 2 ]; then val="$2"; shift 2; else shift; fi;; *) shift;; esac; done
if [ "$cmd" = "find-generic-password" ]; then [ -f "$MOCK_DIR/kc/$name" ] && cat "$MOCK_DIR/kc/$name" && exit 0; exit 44; fi
if [ "$cmd" = "add-generic-password" ]; then printf '%s' "$val" > "$MOCK_DIR/kc/$name"; echo "SET $name" >> "$MOCK_DIR/kc.log"; exit 0; fi
exit 1
S
cat > "$W/bin/curl" <<'C'
#!/usr/bin/env python3
import sys, os, json
a = sys.argv[1:]; method = 'GET'; out = None; wfmt = None; headers = []; data = None; forms = []; url = None
i = 0
while i < len(a):
    x = a[i]
    if x == '-X': method = a[i+1]; i += 2; continue
    if x == '-o': out = a[i+1]; i += 2; continue
    if x == '-w': wfmt = a[i+1]; i += 2; continue
    if x == '-H':
        h = a[i+1]; headers.append(open(h[1:]).read().strip() if h.startswith('@') else h); i += 2; continue
    if x == '--data-binary': d = a[i+1]; data = open(d[1:]).read() if d.startswith('@') else d; i += 2; continue
    if x == '-F': forms.append(a[i+1]); i += 2; continue
    if x.startswith('-'): i += 1; continue
    url = x; i += 1
if forms and method == 'GET': method = 'POST'
mode = os.environ['MOCK_MODE']; md = os.environ['MOCK_DIR']
auth = next((h for h in headers if h.startswith('Authorization')), '')
with open(md + '/calls.log', 'a') as f:
    f.write(json.dumps({'method': method, 'url': url, 'auth': auth[:22], 'body': data, 'forms': forms}) + '\n')
ok = lambda r: {'success': True, 'errors': [], 'result': r}
p = url.split('api.cloudflare.com/client/v4')[-1]
code = 200
if 'api.cloudflare.com' in url and 'Bearer bad' in auth:
    body, code = {'success': False, 'errors': [{'code': 10000, 'message': 'Authentication error'}]}, 403
elif p.startswith('/user/tokens/verify'): body = ok({'id': 't', 'status': 'active'})
elif p.startswith('/accounts?'): body = ok([{'id': 'acct123', 'name': 'Test Account'}])
elif p.startswith('/accounts/acct123/storage/kv/namespaces') and method == 'GET':
    body = ok([{'id': 'kvEXISTING', 'title': 'godview-watch'}] if mode == 'again' else [{'id': 'other', 'title': 'something-else'}])
elif p.startswith('/accounts/acct123/storage/kv/namespaces') and method == 'POST': body = ok({'id': 'kvNEW', 'title': 'godview-watch'})
elif p == '/accounts/acct123/workers/scripts/godview-watch' and method == 'PUT':
    meta = json.loads(open([f for f in forms if f.startswith('metadata=@')][0].split('=@')[1].split(';')[0]).read())
    mod = [f for f in forms if f.startswith('worker.js=@')][0]
    good = meta.get('main_module') == 'worker.js' and meta['bindings'][0]['type'] == 'kv_namespace' and 'application/javascript+module' in mod
    body = ok({'id': 'godview-watch'}) if good else {'success': False, 'errors': [{'message': 'bad upload ' + json.dumps(meta)}]}
elif p.endswith('/schedules'): body = ok({'schedules': json.loads(data)})
elif p == '/accounts/acct123/workers/subdomain': body = ok({'subdomain': 'testsub'})
elif p.endswith('/subdomain'): body = ok({'enabled': True})
elif p.endswith('/secrets'): body = ok({'name': json.loads(data)['name'], 'type': 'secret_text'})
elif 'workers.dev/selftest' in url:
    body = {'ok': False, 'checks': [{'id': 'alerts', 'ok': True}, {'id': 'storms', 'ok': True}, {'id': 'tropical', 'ok': False, 'error': 'HTTP 502'}]}
elif 'workers.dev/test-notify' in url: body = {'ok': True}
else: body, code = {'success': False, 'errors': [{'message': 'mock: unknown ' + p}]}, 404
if out: open(out, 'w').write(json.dumps(body))
else: sys.stdout.write(json.dumps(body))
if wfmt: sys.stdout.write(str(code))
C
chmod +x "$W/bin/security" "$W/bin/curl"
printf "cf-token-typed\n\n" | PATH="$W/bin:$PATH" bash "$SERVER/Deploy GodView Watch.command" > "$W/out.txt" 2>&1
echo "exit=$?" >> "$W/out.txt"
cat "$W/out.txt"
echo "----- calls -----"
python3 - "$W/calls.log" <<'PY'
import json, sys
for l in open(sys.argv[1]):
    c = json.loads(l)
    extra = ''
    if c['body']:
        b = json.loads(c['body']); extra = ' ' + json.dumps({k: (v if k != 'text' else '***') for k, v in b.items()} if isinstance(b, dict) else b)
    if c['forms']: extra = ' [multipart: ' + ', '.join(f.split('=')[0] for f in c['forms']) + ']'
    print(c['method'], c['url'].replace('https://api.cloudflare.com/client/v4', ''), extra)
PY
echo "----- keychain writes -----"; cat "$W/kc.log" 2>/dev/null || echo none
