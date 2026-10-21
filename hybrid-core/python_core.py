"""Minimal, bounded Python processing core for REDULTRON's hybrid architecture.

Run behind an HTTPS reverse proxy. Configure OWNER_SECRET in the service environment;
never put it in source control, browser code, or logs.
"""
from __future__ import annotations

import json
import os
import re
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from collections import Counter
from urllib.parse import urlparse

MAX_BODY_BYTES = 20_000
MAX_TEXT_CHARS = 16_000
ALLOWED_TASKS = {"summarize", "extract_keywords", "classify_text"}


def process_task(task: str, text: str):
    """Deterministic bounded transforms; no arbitrary code or tool execution."""
    if task not in ALLOWED_TASKS:
        raise ValueError("HYBRID_TASK_NOT_ALLOWED")
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_CHARS:
        raise ValueError("HYBRID_TEXT_LENGTH_INVALID")
    normalized = re.sub(r"\s+", " ", text).strip()
    if task == "summarize":
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", normalized) if s.strip()]
        return " ".join(sentences[:3])[:2000]
    if task == "extract_keywords":
        words = re.findall(r"[A-Za-z][A-Za-z0-9'-]{2,}", normalized.lower())
        stop = {"the", "and", "for", "that", "with", "this", "from", "are", "was", "were", "have", "has"}
        return [{"term": word, "count": count} for word, count in Counter(w for w in words if w not in stop).most_common(12)]
    lower = normalized.lower()
    labels = []
    if any(term in lower for term in ("error", "failed", "exception", "timeout", "bug")):
        labels.append("technical_issue")
    if any(term in lower for term in ("news", "today", "headline", "breaking")):
        labels.append("current_information")
    if not labels:
        labels.append("general")
    return {"labels": labels, "characters": len(normalized)}


class Handler(BaseHTTPRequestHandler):
    server_version = "REDULTRON-PythonCore"

    def _json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Never log headers, request bodies, credentials, or user text.
        return

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            self._json(200, {"ok": True, "service": "redultron-python-core"})
        else:
            self._json(404, {"ok": False, "code": "NOT_FOUND"})

    def do_POST(self):
        if urlparse(self.path).path != "/v1/execute":
            self._json(404, {"ok": False, "code": "NOT_FOUND"})
            return
        expected = os.environ.get("OWNER_SECRET", "")
        supplied = self.headers.get("X-Owner-Secret", "")
        if not expected or not supplied or not secrets.compare_digest(supplied, expected):
            self._json(401, {"ok": False, "code": "OWNER_AUTH_REQUIRED"})
            return
        raw_length = self.headers.get("Content-Length", "")
        try:
            length = int(raw_length)
        except (TypeError, ValueError):
            self._json(400, {"ok": False, "code": "INVALID_CONTENT_LENGTH"})
            return
        if length < 1 or length > MAX_BODY_BYTES:
            self._json(413, {"ok": False, "code": "REQUEST_TOO_LARGE"})
            return
        try:
            body = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {"ok": False, "code": "INVALID_JSON"})
            return
        if not isinstance(body, dict):
            self._json(400, {"ok": False, "code": "INVALID_REQUEST"})
            return
        try:
            result = process_task(body.get("task"), body.get("text"))
        except ValueError as exc:
            code = str(exc)
            self._json(400, {"ok": False, "code": code})
            return
        self._json(200, {"ok": True, "task": body["task"], "result": result})


def main():
    secret = os.environ.get("OWNER_SECRET", "")
    if len(secret) < 32:
        raise SystemExit("OWNER_SECRET must be configured with at least 32 characters.")
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", "8788"))), Handler)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
