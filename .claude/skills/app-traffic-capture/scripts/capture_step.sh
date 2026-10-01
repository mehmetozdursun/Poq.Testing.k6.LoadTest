#!/bin/bash
# Export what Charles recorded since the last step, print the Poq API calls (masked), then clear
# Charles so the next step starts empty. One call per app action = one clean file per step.
#
#   capture_step.sh <out-dir> <step-name> [host-filter]
#
#   out-dir      where <step-name>.json goes (unmasked evidence: keep it out of git)
#   step-name    e.g. 05_plp_sort — number steps so the files sort in the order they happened
#   host-filter  substring of the host to print (default: poq.io)
#
# Prints: "== METHOD host/path query -> status" per call, the JSON request body, the error body for
# 4xx/5xx, and "!! NOT DECRYPTED" for hosts Charles could only see as CONNECT tunnels.
# Hidden: blob/media downloads and dynamicyield/identifiers polling (noise on every screen);
# they are still in the saved JSON. Set SHOW_ALL=1 to print them too.
set -euo pipefail
DIR="${1:?out-dir}"; NAME="${2:?step-name}"; HOST="${3:-poq.io}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DIR"
if [ "${SHOW_ALL:-0}" = "1" ]; then NOISE='^$'; else NOISE='/blob/|dynamicyield/identifiers'; fi
python3 "$HERE/charles_capture.py" export "$DIR/$NAME.json" --host "$HOST" \
  | grep -E '^==|^   REQ|^   RESP|^!!' | grep -v -E "$NOISE" | grep -v 'control.charles' | cut -c1-400 || true
python3 "$HERE/charles_capture.py" clear >/dev/null
