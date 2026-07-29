#!/bin/bash
# Harness for deploy_dir's preserved-key handling. Exercises the real _lib.sh
# against synthetic keyfiles; `install` is shimmed so it runs unprivileged.
set -u

LIB="${1:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"

# shellcheck disable=SC1090
source "$LIB"

# Shim install(1): drop the -o/-g root ownership so this runs as a normal user.
install() {
  local mode="" args=() a
  while [ $# -gt 0 ]; do
    case "$1" in
      -o|-g) shift 2 ;;
      -m) mode="$2"; shift 2 ;;
      *) args+=("$1"); shift ;;
    esac
  done
  cp "${args[0]}" "${args[1]}" && { [ -n "$mode" ] && chmod "$mode" "${args[1]}"; return 0; }
}

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (want '$3', got '$2')"; fi; }

KEYS='^(timestamp|apn|autoconnect)='

# The repo's shipped profile, as on lts_26_07.iso.
write_src() {
  cat >"$1/station-modem.nmconnection" <<'EOF'
[connection]
id=station-modem
type=gsm
autoconnect=false

[gsm]
apn=super

[ipv4]
method=auto
EOF
}

run_case() {
  local name="$1" dst_body="$2" extra_src="${3:-}"
  SRC="$(mktemp -d)"; DST="$(mktemp -d)"
  write_src "$SRC"
  [ -n "$extra_src" ] && printf '%s\n' "$extra_src" >>"$SRC/station-modem.nmconnection"
  [ -n "$dst_body" ] && printf '%s' "$dst_body" >"$DST/station-modem.nmconnection"
  printf '\n== %s\n' "$name"
  OUT="$(deploy_dir "$SRC" "$DST" '*.nmconnection' 600 "$KEYS" '' 2>&1)"
  RESULT="$DST/station-modem.nmconnection"
}

# A Quectel's live keyfile: NM omitted autoconnect because yes IS the default.
# apn was rewritten by provision-modem-apn.sh. A non-mutable line differs
# (method), so deploy_dir must reinstall — the moment the old code clobbered it.
run_case "Quectel: live autoconnect omitted (=default yes), reinstall forced" \
'[connection]
id=station-modem
type=gsm

[gsm]
apn=internet.cxn

[ipv4]
method=manual
'
check "reinstalled"                    "$(grep -c 'installed' <<<"$OUT")" "1"
check "autoconnect line NOT written"   "$(grep -c '^autoconnect=' "$RESULT")" "0"
check "live apn preserved"             "$(grep '^apn=' "$RESULT")" "apn=internet.cxn"
check "non-mutable line takes src"     "$(grep '^method=' "$RESULT")" "method=auto"
check "apn still inside [gsm]"         "$(awk '/^\[/{s=$0} /^apn=/{print s}' "$RESULT")" "[gsm]"

# A Telit: autoconnect=false is non-default, so NM DOES write it. It must
# survive exactly as before — this is the case the old code got right.
run_case "Telit: live autoconnect=false is written, must survive" \
'[connection]
id=station-modem
type=gsm
autoconnect=false

[gsm]
apn=internet.cxn

[ipv4]
method=manual
'
check "autoconnect=false preserved"    "$(grep '^autoconnect=' "$RESULT")" "autoconnect=false"
check "autoconnect still in [connection]" "$(awk '/^\[/{s=$0} /^autoconnect=/{print s}' "$RESULT")" "[connection]"

# Only mutable keys differ → must not touch the file at all.
run_case "only mutable keys differ → no reinstall" \
'[connection]
id=station-modem
type=gsm

[gsm]
apn=internet.cxn

[ipv4]
method=auto
'
check "reported no changes"            "$(grep -c 'no changes' <<<"$OUT")" "1"
check "file untouched (no autoconnect)" "$(grep -c '^autoconnect=' "$RESULT")" "0"
check "file untouched (apn kept)"      "$(grep '^apn=' "$RESULT")" "apn=internet.cxn"

# Fresh station: no destination yet, so there is no live value to preserve and
# the shipped defaults must land verbatim.
run_case "fresh install (no dst) → src verbatim" ""
check "installed"                      "$(grep -c 'installed' <<<"$OUT")" "1"
check "src autoconnect=false lands"    "$(grep '^autoconnect=' "$RESULT")" "autoconnect=false"
check "src apn lands"                  "$(grep '^apn=' "$RESULT")" "apn=super"

# Idempotency: re-running against what we just deployed must be a no-op.
printf '\n== idempotency: second run over the merged result\n'
OUT2="$(deploy_dir "$SRC" "$DST" '*.nmconnection' 600 "$KEYS" '' 2>&1)"
check "second run reports no changes"  "$(grep -c 'no changes' <<<"$OUT2")" "1"

printf '\n%s checks passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
