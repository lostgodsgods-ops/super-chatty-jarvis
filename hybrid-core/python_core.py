"""Bounded REDULTRON processing sidecar. Keep behind HTTPS ingress."""
from __future__ import annotations

import json
import logging
import os
import re
import secrets
import socket
import time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

MAX_BODY_BYTES = 10 * 1024
MAX_TEXT_CHARS = 16_000
REQUEST_TIMEOUT_SECONDS = 5
ALLOWED_TASKS = {"summarize", "extract_keywords", "classify_text"}


def _reject_duplicate_json_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def process_task(task: str, text: str):
    """Deterministic bounded transforms; never execute arbitrary code."""
    if not isinstance(task, str) or task not in ALLOWED_TASKS:
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
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(REQUEST_TIMEOUT_SECONDS)
        self._request_id = secrets.token_hex(8)
        self._event_code = None
        self._request_started_at = time.monotonic()

    def _bind_request_id(self):
        # Accept only a bounded opaque identifier; never reflect arbitrary header text.
        candidate = self.headers.get("X-Request-ID", "")
        if re.fullmatch(r"[A-Za-z0-9._:-]{8,64}", candidate):
            self._request_id = candidate

    def _json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Request-ID", self._request_id)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            pass
        finally:
            # Structured diagnostics deliberately omit paths, headers, secrets, and bodies.
            event = {
                "request_id": self._request_id,
                "status": status,
                "latency_ms": max(0, int((time.monotonic() - self._request_started_at) * 1000)),
            }
            if self._event_code:
                event["event_code"] = self._event_code
            logging.getLogger("redultron.python_core").info(
                json.dumps(event, separators=(",", ":"), sort_keys=True)
            )

    def log_message(self, fmt, *args):
        # Disable BaseHTTPRequestHandler's request-line logging, which may include query data.
        return

    def do_GET(self):
        self._bind_request_id()
        if urlparse(self.path).path == "/health":
            self._json(200, {"ok": True, "service": "redultron-python-core"})
        else:
            self._json(404, {"ok": False, "code": "NOT_FOUND"})

    def do_POST(self):
        self._bind_request_id()
        if urlparse(self.path).path != "/v1/execute":
            self._json(404, {"ok": False, "code": "NOT_FOUND"})
            return
        expected = os.environ.get("OWNER_SECRET", "")
        supplied = self.headers.get("X-Owner-Secret", "")
        if len(expected) < 32 or not supplied or not secrets.compare_digest(supplied, expected):
            self._event_code = "AUTH_REJECTED"
            self._json(401, {"ok": False, "code": "OWNER_AUTH_REQUIRED"})
            return

        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or self.headers.get("Transfer-Encoding") is not None:
            self._json(400, {"ok": False, "code": "INVALID_REQUEST_FRAMING"})
            return
        media_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if media_type != "application/json":
            self._json(415, {"ok": False, "code": "UNSUPPORTED_MEDIA_TYPE"})
            return
        raw_length = lengths[0].strip()
        if not raw_length.isascii() or not raw_length.isdecimal() or len(raw_length) > 10:
            self._json(400, {"ok": False, "code": "INVALID_CONTENT_LENGTH"})
            return
        try:
            length = int(raw_length)
        except ValueError:
            self._json(400, {"ok": False, "code": "INVALID_CONTENT_LENGTH"})
            return
        if length < 1:
            self._json(400, {"ok": False, "code": "INVALID_CONTENT_LENGTH"})
            return
        if length > MAX_BODY_BYTES:
            self._json(413, {"ok": False, "code": "REQUEST_TOO_LARGE"})
            return
        try:
            raw_body = self.rfile.read(length)
        except (TimeoutError, socket.timeout):
            self._json(408, {"ok": False, "code": "REQUEST_BODY_TIMEOUT"})
            return
        if len(raw_body) != length:
            self._json(400, {"ok": False, "code": "INCOMPLETE_REQUEST_BODY"})
            return
        try:
            body = json.loads(raw_body.decode("utf-8"), object_pairs_hook=_reject_duplicate_json_keys)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {"ok": False, "code": "INVALID_JSON"})
            return
        except ValueError as exc:
            code = str(exc) if str(exc) == "DUPLICATE_JSON_KEY" else "INVALID_JSON"
            self._json(400, {"ok": False, "code": code})
            return
        if not isinstance(body, dict) or set(body) != {"task", "text"}:
            self._json(400, {"ok": False, "code": "INVALID_REQUEST_FIELDS"})
            return
        try:
            result = process_task(body.get("task"), body.get("text"))
        except ValueError as exc:
            self._json(400, {"ok": False, "code": str(exc)})
            return
        self._json(200, {"ok": True, "task": body["task"], "result": result})


class SecureThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = True
    request_queue_size = 32


def main():
    if len(os.environ.get("OWNER_SECRET", "")) < 32:
        raise SystemExit("OWNER_SECRET must be configured with at least 32 characters.")
    host = os.environ.get("HOST", "127.0.0.1")
    if host not in {"127.0.0.1", "0.0.0.0"}:
        raise SystemExit("HOST must be 127.0.0.1 or 0.0.0.0.")
    try:
        port = int(os.environ.get("PORT", "8788"))
    except ValueError as exc:
        raise SystemExit("PORT must be a valid integer.") from exc
    if not 1 <= port <= 65535:
        raise SystemExit("PORT must be between 1 and 65535.")
    server = SecureThreadingHTTPServer((host, port), Handler)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
