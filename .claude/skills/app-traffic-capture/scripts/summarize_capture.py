#!/usr/bin/env python3
"""Summarise captured app traffic into an endpoint inventory (Markdown, printed).

  summarize_capture.py <capture-dir-or-files...> [--host dev.poq.io] [--timeline]

Reads Charles JSON session exports: the per-step files written by capture_step.sh, or a whole
session exported from the Charles UI (File > Export Session > JSON). The files are read in name
order, so numbered step names keep the order the calls happened in.

Prints:
  1. Endpoints: one row per METHOD + path template (ids/UUIDs → {id}), with the first step it
     appeared in, call count, statuses, query keys, whether a Bearer token was sent, accept-version,
     the JSON request-body shape and the response's top-level keys.
  2. Identity headers per platform (platform / user-agent / version-code / slot conditions …).
     Authorization, poq-auth and cookies are shown as <set>, never their values.
  3. Findings worth raising: 4xx/5xx endpoints, "401 then retried with a token" pairs, and
     endpoints polled more than 5 times.
  --timeline additionally prints every call in order (time, method, path, status, token yes/no).
"""
import argparse, base64, collections, glob, json, os, re, sys

UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
IDENTITY = ["platform", "user-agent", "version-code", "poq-app-id", "poq-app-identifier", "poq-slot-conditions",
            "currency-code", "poq-currency-identifier", "poq-country-identifier", "accept-language", "content-type"]
SECRET_HEADERS = re.compile(r"authorization|poq-auth|cookie|token", re.I)


def body(part):
    b = (part or {}).get("body") or {}
    t = b.get("text")
    if t and b.get("encoded"):
        t = base64.b64decode(t).decode("utf8", "replace")
    return t or ""


def headers(part):
    return {h["name"].lower(): h["value"] for h in ((part or {}).get("header") or {}).get("headers") or []
            if not h["name"].startswith(":")}


def template(path):
    segs = []
    for s in path.split("/"):
        segs.append("{id}" if UUID.match(s) or re.fullmatch(r"\d{4,}|[0-9a-f]{20,}", s or "-") else s)
    return "/".join(segs)


def shape(text):
    try:
        j = json.loads(text)
    except ValueError:
        return "non-JSON" if text else ""
    if isinstance(j, dict):
        return "{" + ",".join(list(j.keys())[:10]) + "}"
    if isinstance(j, list):
        first = j[0] if j else None
        inner = "{" + ",".join(list(first.keys())[:8]) + "}" if isinstance(first, dict) else ""
        return f"[{len(j)}]{inner}"
    return type(j).__name__


def platform_of(h):
    p = (h.get("platform") or "").lower()
    if p in ("iphone", "ipad", "ios"):
        return "ios"
    return "android" if p == "android" else (p or "no platform header (web views, OS or other apps)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--host", default="poq.io", help="substring of the API host (default poq.io)")
    ap.add_argument("--timeline", action="store_true")
    a = ap.parse_args()

    files = []
    for i in a.inputs:
        files += sorted(glob.glob(os.path.join(i, "*.json"))) if os.path.isdir(i) else [i]
    calls = []
    for f in files:
        try:
            entries = json.load(open(f))
        except (ValueError, OSError) as e:
            print(f"skip {f}: {e}", file=sys.stderr)
            continue
        for e in entries if isinstance(entries, list) else []:
            host, path = e.get("host") or "", e.get("path") or ""
            # API calls only: media downloads (/blob/…) and tunnels are not endpoints.
            if a.host not in host or e.get("tunnel") or e.get("method") == "CONNECT" or not path or path.startswith("/blob/"):
                continue
            req_h = headers(e.get("request"))
            status = (e.get("response") or {}).get("status")
            calls.append({
                "step": os.path.splitext(os.path.basename(f))[0], "method": e.get("method"),
                "path": path, "tpl": template(path), "query": e.get("query") or "", "status": status,
                "time": ((e.get("times") or {}).get("start") or "")[11:23], "headers": req_h,
                "auth": "authorization" in req_h, "req": body(e.get("request")), "resp": body(e.get("response")),
            })
    if not calls:
        sys.exit(f"no {a.host} calls found in {len(files)} file(s)")

    # 1. endpoint inventory
    groups = collections.OrderedDict()
    for c in calls:
        groups.setdefault((c["method"], c["tpl"]), []).append(c)
    print(f"## Endpoints ({len(groups)} across {len(calls)} calls, {len(files)} file(s))\n")
    print("| Method | Path | First step | Calls | Statuses | Query keys | Token | accept-version | Request body | Response |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for (m, tpl), cs in groups.items():
        qkeys = sorted({kv.split("=")[0] for c in cs for kv in c["query"].split("&") if kv})
        statuses = ",".join(str(s) for s in sorted({c["status"] for c in cs}, key=str))
        token = "yes" if all(c["auth"] for c in cs) else "no" if not any(c["auth"] for c in cs) else "mixed"
        av = ",".join(sorted({c["headers"].get("accept-version", "") for c in cs} - {""})) or "-"
        ok = [c for c in cs if c["status"] in (200, 201, 204)] or cs
        print(f"| {m} | `{tpl}` | {cs[0]['step']} | {len(cs)} | {statuses} | {' '.join(qkeys) or '-'} | {token} | {av} "
              f"| {shape(ok[0]['req']) or '-'} | {shape(ok[0]['resp']) or '-'} |")

    # 2. identity headers per platform
    print("\n## Identity headers per platform\n")
    by_platform = collections.defaultdict(lambda: collections.defaultdict(set))
    for c in calls:
        plat = platform_of(c["headers"])
        for k, v in c["headers"].items():
            if k == "poq-slot-conditions":  # apps send the same conditions in varying order
                by_platform[plat][k].add("&".join(sorted(v.split("&"))))
            elif k in IDENTITY:
                by_platform[plat][k].add(v[:90])
            elif SECRET_HEADERS.search(k):
                by_platform[plat][k].add("<set>")
    for plat, hs in by_platform.items():
        print(f"**{plat}**")
        for k in sorted(hs):
            print(f"- `{k}`: {' | '.join(sorted(hs[k]))}")
        print()

    # 3. findings
    print("## Findings\n")
    errors = [(m, tpl, sorted({c['status'] for c in cs if isinstance(c['status'], int) and c['status'] >= 400}))
              for (m, tpl), cs in groups.items()]
    for m, tpl, st in errors:
        if st:
            print(f"- {m} `{tpl}` returned {st}")
    retried = set()
    for i, c in enumerate(calls):
        if c["status"] == 401 and not c["auth"]:
            for d in calls[i + 1:i + 8]:
                if d["path"] == c["path"] and d["query"] == c["query"] and d["auth"] and d["status"] in (200, 204):
                    retried.add((c["method"], c["tpl"]))
                    break
    for m, tpl in sorted(retried):
        print(f"- {m} `{tpl}`: sent without a token first (401), then retried with it (app finding)")
    # Polling: the identical call repeated within one step (browsing many pages is not polling).
    per_step = collections.Counter((c["step"], c["method"], c["tpl"], c["query"]) for c in calls)
    polled = collections.defaultdict(int)
    for (step, m, tpl, q), n in per_step.items():
        if n > 3:
            polled[(m, tpl)] = max(polled[(m, tpl)], n)
    for (m, tpl), n in polled.items():
        print(f"- {m} `{tpl}` repeated up to {n}× within one step — polling; check before load-testing it")

    if a.timeline:
        print("\n## Timeline\n")
        for c in calls:
            print(f"{c['time']} {c['step']:<22} {c['method']:<6} {c['tpl']}{'?' + c['query'][:60] if c['query'] else ''}"
                  f" -> {c['status']} {'token' if c['auth'] else 'no-token'}")


if __name__ == "__main__":
    main()
