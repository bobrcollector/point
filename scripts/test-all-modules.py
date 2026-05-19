#!/usr/bin/env python3
"""Интеграционная проверка всех API-модулей. Пишет NDJSON в debug-18dc1b.log."""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000"
LOG_PATH = Path(__file__).resolve().parents[1] / "debug-18dc1b.log"
SESSION = "18dc1b"
RUN_ID = "integration"


def log(hypothesis_id: str, location: str, message: str, data: dict) -> None:
    entry = {
        "sessionId": SESSION,
        "runId": RUN_ID,
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def req(method: str, path: str, body: dict | None = None, token: str | None = None) -> tuple[int, object]:
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = raw
            return resp.status, parsed
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = raw
        return e.code, parsed
    except urllib.error.URLError as e:
        return 0, {"error": str(e.reason)}


def main() -> int:
    LOG_PATH.write_text("", encoding="utf-8")
    results: list[dict] = []
    failed = 0

    def check(name: str, hid: str, ok: bool, detail: dict) -> None:
        nonlocal failed
        results.append({"module": name, "ok": ok, **detail})
        log(hid, "test-all-modules.py", name, {"ok": ok, **detail})
        if not ok:
            failed += 1

    # A: health
    st, data = req("GET", "/health")
    check("health", "A", st == 200 and data.get("ok"), {"status": st, "data": data})

    st, data = req("GET", "/health/db")
    check("health_db", "A", st == 200 and data.get("ok"), {"status": st, "data": data})

    # B: catalog list + detail 104
    st, data = req("GET", "/api/v1/catalog/events?limit=5")
    items = data.get("items", []) if isinstance(data, dict) else []
    ids = [i.get("event_id") for i in items]
    check("catalog_list", "B", st == 200 and len(items) > 0, {"status": st, "count": len(items), "ids": ids})

    st, data = req("GET", "/api/v1/catalog/events/104")
    check(
        "catalog_detail_104",
        "B",
        st == 200 and isinstance(data, dict) and data.get("event_id") == 104,
        {"status": st, "event_id": data.get("event_id") if isinstance(data, dict) else None},
    )

    st, data = req("GET", "/api/v1/catalog/categories")
    check("catalog_categories", "B", st == 200, {"status": st})

    # C: auth
    st, data = req(
        "POST",
        "/api/v1/auth/login",
        {"email": "dev@point-demo.ru", "password": "dev12345"},
    )
    token = data.get("access_token") if isinstance(data, dict) else None
    check("auth_login", "C", st == 200 and bool(token), {"status": st})

    st, data = req("GET", "/api/v1/users/me", token=token)
    role = data.get("role") if isinstance(data, dict) else None
    check("users_me", "C", st == 200 and role == "admin", {"status": st, "role": role})

    # D: admin
    st, data = req("GET", "/api/v1/admin/dashboard/metrics", token=token)
    check("admin_metrics", "D", st == 200, {"status": st})

    st, data = req("GET", "/api/v1/admin/events/pending", token=token)
    check("admin_pending", "D", st == 200 and isinstance(data, list), {"status": st, "count": len(data) if isinstance(data, list) else 0})

    # E: notifications + push
    st, data = req("GET", "/api/v1/notifications", token=token)
    check("notifications", "E", st == 200 and isinstance(data, list), {"status": st})

    st, data = req("GET", "/api/v1/push/vapid-public-key", token=token)
    check("push_vapid", "E", st == 200 and isinstance(data, dict), {"status": st, "enabled": data.get("enabled") if isinstance(data, dict) else None})

    # organizer (auth required)
    st, data = req("GET", "/api/v1/organizer/events", token=token)
    check("organizer_list", "F", st == 200, {"status": st})

    # chat messages (public read)
    st, data = req("GET", "/api/v1/chat/events/104/messages")
    check("chat_messages", "G", st == 200, {"status": st})

    log("SUMMARY", "test-all-modules.py", "complete", {"failed": failed, "total": len(results), "results": results})
    print(json.dumps({"failed": failed, "total": len(results)}, ensure_ascii=False, indent=2))
    for r in results:
        mark = "OK" if r["ok"] else "FAIL"
        print(f"  [{mark}] {r['module']}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
