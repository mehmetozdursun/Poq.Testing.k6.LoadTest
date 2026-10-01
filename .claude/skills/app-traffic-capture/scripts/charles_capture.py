#!/usr/bin/env python3
"""Clear or export a Charles session through the Charles Web Interface.

Usage:
  charles_capture.py clear
  charles_capture.py export OUT.json [--host dev.poq.io] [--path '/events/']

`export` saves the full session to OUT.json (the evidence file) and prints
every request matching --host / --path (regex) with its status and JSON body.
Hosts that only show as CONNECT tunnels are listed as "NOT DECRYPTED" so
missing SSL Proxying is obvious instead of silently looking like "no traffic".

What is *printed* has secrets masked (passwords, tokens, auth/cookie values,
card data, emails): printed output ends up in chat. OUT.json is saved
unmasked because it is the evidence; keep it in the scratchpad, never in a
repo, and trim + redact it before attaching anywhere.

Env: CHARLES_PROXY (default http://127.0.0.1:8888).
"""
import argparse, base64, json, os, re, subprocess, sys

PROXY = os.environ.get("CHARLES_PROXY", "http://127.0.0.1:8888")


def charles(path):
    # -m 30: Charles answers control.charles locally in well under a second; a
    # large session export can take a few seconds, so 30s only trips when
    # Charles is hung or the proxy address is wrong.
    r = subprocess.run(
        ["curl", "-s", "-m", "30", "-x", PROXY, f"http://control.charles/{path}"],
        capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"Charles web interface unreachable via {PROXY} (curl exit {r.returncode}). "
                 "Is Charles running with Proxy > Web Interface Settings enabled?")
    return r.stdout


SENSITIVE_KEY = re.compile(
    r"pass(word)?|secret|token|auth|cookie|session|api[-_]?key|card|cvv|cvc|iban|email", re.I)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def mask(value):
    """Mask sensitive values in parsed JSON before it is printed."""
    if isinstance(value, dict):
        return {k: ("***" if SENSITIVE_KEY.search(str(k)) and not isinstance(v, (dict, list)) else mask(v))
                for k, v in value.items()}
    if isinstance(value, list):
        return [mask(v) for v in value]
    if isinstance(value, str):
        return EMAIL.sub("***@***", value)
    return value


def mask_query(query):
    return re.sub(r"(?i)(^|&)([^=&]*(?:" + SENSITIVE_KEY.pattern + r")[^=&]*)=[^&]*", r"\1\2=***", query or "")


def body_text(part):
    b = (part or {}).get("body") or {}
    t = b.get("text")
    if t and b.get("encoded"):
        t = base64.b64decode(t).decode("utf8", "replace")
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["clear", "export"])
    ap.add_argument("out", nargs="?")
    ap.add_argument("--host", default=None, help="substring match on host")
    ap.add_argument("--path", default=None, help="regex match on path")
    a = ap.parse_args()

    if a.cmd == "clear":
        charles("session/clear")
        print("Charles session cleared")
        return

    if not a.out:
        sys.exit("export needs an OUT.json path")
    raw = charles("session/export-json")
    try:
        session = json.loads(raw)
    except ValueError:
        sys.exit("Charles returned something that isn't a JSON session export "
                 "(first 200 chars: %r). Check the Web Interface is enabled and "
                 "the Charles version supports session/export-json." % raw[:200])
    json.dump(session, open(a.out, "w"))
    print(f"saved {len(session)} entries -> {a.out}")

    tunnels = set()
    for e in session:
        host, path = e.get("host") or "", e.get("path") or ""
        if a.host and a.host not in host:
            continue
        if e.get("tunnel"):
            tunnels.add(host)
            continue
        if a.path and not re.search(a.path, path):
            continue
        status = (e.get("response") or {}).get("status")
        try:
            status = int(status) if status is not None else None
        except (TypeError, ValueError):
            status = None
        print(f"== {e.get('method')} {host}{path} {mask_query(e.get('query'))} -> {status} [{e.get('status')}]")
        req = body_text(e.get("request"))
        if req:
            try:
                print("   REQ ", json.dumps(mask(json.loads(req)))[:1500])
            except ValueError:
                print("   REQ ", EMAIL.sub("***@***", req[:500]), "(not JSON; check for secrets before quoting)")
        resp = body_text(e.get("response"))
        if resp and status and status >= 400:
            try:
                print("   RESP", json.dumps(mask(json.loads(resp)))[:500])
            except ValueError:
                print("   RESP", EMAIL.sub("***@***", resp[:500]))
    for h in sorted(tunnels):
        print(f"!! NOT DECRYPTED (CONNECT tunnel only): {h} - enable SSL Proxying / check CA trust")


if __name__ == "__main__":
    main()
