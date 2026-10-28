import http.client
import json
import os
import socket
import subprocess
import sys
from pathlib import Path
import threading
import unittest
from http.server import ThreadingHTTPServer

import python_core
from python_core import Handler, process_task

TEST_SECRET = "test-only-secret-value-at-least-32-chars"


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True


class HybridCoreTests(unittest.TestCase):
    def test_summarize_is_bounded_to_three_sentences(self):
        self.assertEqual(process_task("summarize", "One. Two. Three. Four."), "One. Two. Three.")

    def test_extract_keywords_returns_ranked_terms(self):
        result = process_task("extract_keywords", "Worker timeout. Worker failed. Search timeout.")
        self.assertEqual(result[0], {"term": "worker", "count": 2})
        self.assertEqual(result[1], {"term": "timeout", "count": 2})

    def test_classify_text_reports_multiple_applicable_labels(self):
        result = process_task("classify_text", "Breaking news: Worker timeout today.")
        self.assertEqual(result["labels"], ["technical_issue", "current_information"])

    def test_disallowed_task_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "HYBRID_TASK_NOT_ALLOWED"):
            process_task("execute_shell", "whoami")

    def test_non_string_task_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "HYBRID_TASK_NOT_ALLOWED"):
            process_task([], "text")

    def test_empty_or_oversized_text_is_rejected(self):
        for value in ("  ", "x" * 16001):
            with self.subTest(length=len(value)):
                with self.assertRaisesRegex(ValueError, "HYBRID_TEXT_LENGTH_INVALID"):
                    process_task("summarize", value)


class HybridCoreHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["OWNER_SECRET"] = TEST_SECRET
        cls.server = QuietThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        os.environ.pop("OWNER_SECRET", None)

    def request(self, body=None, headers=None, path="/v1/execute"):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=8)
        conn.request("POST", path, body=body, headers=headers or {})
        response = conn.getresponse()
        result = response.status, response.getheaders(), response.read()
        conn.close()
        return result

    def test_health_is_minimal(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        conn.request("GET", "/health")
        response = conn.getresponse()
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.read()), {"ok": True, "service": "redultron-python-core"})
        conn.close()

    def test_unknown_route_is_404(self):
        status, _, body = self.request("{}", {"X-Owner-Secret": TEST_SECRET}, "/not-a-route")
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(body)["code"], "NOT_FOUND")

    def test_requires_owner_secret(self):
        status, _, body = self.request(json.dumps({"task": "summarize", "text": "hello"}),
                                       {"Content-Type": "application/json"})
        self.assertEqual(status, 401)
        self.assertEqual(json.loads(body)["code"], "OWNER_AUTH_REQUIRED")

    def test_rejects_duplicate_content_length(self):
        raw = (
            f"POST /v1/execute HTTP/1.1\r\nHost: localhost\r\n"
            f"X-Owner-Secret: {TEST_SECRET}\r\nContent-Type: application/json\r\n"
            "Content-Length: 35\r\nContent-Length: 1\r\nConnection: close\r\n\r\n"
            '{"task":"summarize","text":"hello"}'
        ).encode()
        with socket.create_connection(("127.0.0.1", self.port), timeout=3) as sock:
            sock.settimeout(3)
            sock.sendall(raw)
            chunks = []
            while True:
                try:
                    chunk = sock.recv(4096)
                except socket.timeout:
                    break
                if not chunk:
                    break
                chunks.append(chunk)
        response = b"".join(chunks).decode("iso-8859-1")
        self.assertIn("400", response.split("\r\n", 1)[0])
        self.assertIn("INVALID_REQUEST_FRAMING", response)

    def test_rejects_transfer_encoding(self):
        status, _, body = self.request('{"task":"summarize","text":"hello"}',
            {"X-Owner-Secret": TEST_SECRET, "Transfer-Encoding": "chunked", "Content-Type": "application/json"})
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "INVALID_REQUEST_FRAMING")

    def test_rejects_wrong_content_type(self):
        status, _, body = self.request('{"task":"summarize","text":"hello"}',
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "text/plain"})
        self.assertEqual(status, 415)
        self.assertEqual(json.loads(body)["code"], "UNSUPPORTED_MEDIA_TYPE")

    def test_rejects_malformed_json(self):
        status, _, body = self.request('{"task":',
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json"})
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "INVALID_JSON")

    def test_rejects_non_object_and_extra_fields(self):
        for payload in ('["summarize","hello"]', '{"task":"summarize","text":"hello","extra":true}'):
            with self.subTest(payload=payload):
                status, _, body = self.request(payload,
                    {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json"})
                self.assertEqual(status, 400)
                self.assertEqual(json.loads(body)["code"], "INVALID_REQUEST_FIELDS")

    def test_rejects_short_body_read(self):
        status, _, body = self.request('{"task":"summarize","text":"hello"}',
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json", "Content-Length": "100"})
        self.assertIn(status, (400, 408))
        self.assertNotEqual(json.loads(body).get("ok"), True)

    def test_accepts_request_body_at_exact_10_kibibyte_limit(self):
        prefix = b'{"task":"summarize","text":"'
        suffix = b'"}'
        text = b"a" * (10 * 1024 - len(prefix) - len(suffix))
        body = prefix + text + suffix
        self.assertEqual(len(body), 10 * 1024)
        status, _, response_body = self.request(
            body.decode("ascii"),
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json"},
        )
        self.assertEqual(status, 200, response_body.decode("utf-8"))

    def test_rejects_request_body_one_byte_over_10_kibibyte_limit(self):
        prefix = b'{"task":"summarize","text":"'
        suffix = b'"}'
        text = b"a" * (10 * 1024 + 1 - len(prefix) - len(suffix))
        body = prefix + text + suffix
        self.assertEqual(len(body), 10 * 1024 + 1)
        status, _, response_body = self.request(
            body.decode("ascii"),
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json"},
        )
        self.assertEqual(status, 413)
        self.assertEqual(json.loads(response_body)["code"], "REQUEST_TOO_LARGE")

    def test_rejects_extremely_long_content_length_header(self):
        status, _, body = self.request("{}", {
            "X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json", "Content-Length": "9" * 5000})
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "INVALID_CONTENT_LENGTH")

    def test_rejects_duplicate_json_keys(self):
        status, _, body = self.request('{"task":"summarize","task":"classify_text","text":"hello"}',
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json"})
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "DUPLICATE_JSON_KEY")

    def test_success_responses_disable_caching(self):
        status, headers, body = self.request(json.dumps({"task": "summarize", "text": "One. Two."}),
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json"})
        self.assertEqual(status, 200)
        self.assertIn(("Cache-Control", "no-store"), headers)
        self.assertTrue(json.loads(body)["ok"])



    def test_response_logs_request_id_status_and_latency_without_secrets_or_body(self):
        with self.assertLogs("redultron.python_core", level="INFO") as captured:
            status, headers, body = self.request(
                json.dumps({"task": "classify_text", "text": "diagnostic body must not be logged"}),
                {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json"},
            )
        self.assertEqual(status, 200)
        response_headers = dict(headers)
        self.assertRegex(response_headers.get("X-Request-ID", ""), r"^[a-f0-9]{16}$")
        entries = [json.loads(record.getMessage()) for record in captured.records]
        self.assertEqual(len(entries), 1)
        event = entries[0]
        self.assertEqual(event["request_id"], response_headers["X-Request-ID"])
        self.assertEqual(event["status"], 200)
        self.assertIsInstance(event["latency_ms"], int)
        self.assertGreaterEqual(event["latency_ms"], 0)
        rendered = json.dumps(event)
        self.assertNotIn(TEST_SECRET, rendered)
        self.assertNotIn("diagnostic body must not be logged", rendered)


if __name__ == "__main__":
    unittest.main()


class HybridDeploymentConfigTests(unittest.TestCase):
    def test_procfile_starts_the_actual_python_http_server(self):
        from pathlib import Path
        procfile = Path(__file__).with_name("Procfile").read_text(encoding="utf-8").strip()
        self.assertEqual(procfile, "web: HOST=0.0.0.0 python python_core.py")



class HybridCoreAuthRedactionRegressionTests(unittest.TestCase):
    """Authentication failures must be precise without disclosing either secret."""

    def setUp(self):
        self.previous_secret = os.environ.get("OWNER_SECRET")
        os.environ["OWNER_SECRET"] = TEST_SECRET
        self.server = QuietThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        if self.previous_secret is None:
            os.environ.pop("OWNER_SECRET", None)
        else:
            os.environ["OWNER_SECRET"] = self.previous_secret

    def test_wrong_owner_secret_returns_sanitized_auth_code_without_echo(self):
        wrong_secret = "wrong-test-secret-that-must-not-appear"
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=8)
        conn.request(
            "POST",
            "/v1/execute",
            body=json.dumps({"task": "summarize", "text": "safe test"}),
            headers={
                "Content-Type": "application/json",
                "X-Owner-Secret": wrong_secret,
            },
        )
        response = conn.getresponse()
        status = response.status
        headers = dict(response.getheaders())
        body = response.read().decode("utf-8")
        conn.close()

        self.assertEqual(status, 401)
        self.assertEqual(json.loads(body), {"ok": False, "code": "OWNER_AUTH_REQUIRED"})
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertNotIn(TEST_SECRET, body)
        self.assertNotIn(wrong_secret, body)

    def test_missing_owner_secret_fails_closed_with_sanitized_code(self):
        os.environ.pop("OWNER_SECRET", None)
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=8)
        conn.request(
            "POST",
            "/v1/execute",
            body=json.dumps({"task": "summarize", "text": "safe test"}),
            headers={
                "Content-Type": "application/json",
                "X-Owner-Secret": TEST_SECRET,
            },
        )
        response = conn.getresponse()
        status = response.status
        body = response.read().decode("utf-8")
        conn.close()

        self.assertEqual(status, 401)
        self.assertEqual(json.loads(body), {"ok": False, "code": "OWNER_AUTH_REQUIRED"})
        self.assertNotIn(TEST_SECRET, body)


    def test_auth_rejection_logs_safe_event_and_preserves_correlation_id(self):
        request_id = "diag-test-12345678"
        wrong_secret = "wrong-secret-must-not-appear-in-logs"
        with self.assertLogs("redultron.python_core", level="INFO") as captured:
            conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=8)
            conn.request(
                "POST",
                "/v1/execute",
                body=json.dumps({"task": "summarize", "text": "safe test"}),
                headers={
                    "Content-Type": "application/json",
                    "X-Owner-Secret": wrong_secret,
                    "X-Request-ID": request_id,
                },
            )
            response = conn.getresponse()
            status = response.status
            headers = dict(response.getheaders())
            body = response.read().decode("utf-8")
            conn.close()

        self.assertEqual(status, 401)
        self.assertEqual(headers.get("X-Request-ID"), request_id)
        self.assertEqual(json.loads(body), {"ok": False, "code": "OWNER_AUTH_REQUIRED"})
        events = "\\n".join(captured.output)
        self.assertIn(request_id, events)
        self.assertIn("AUTH_REJECTED", events)
        self.assertNotIn(TEST_SECRET, events)
        self.assertNotIn(wrong_secret, events)


class PythonCoreStartupSecretGuardTests(unittest.TestCase):
    def test_startup_rejects_short_owner_secret_without_echoing_it(self):
        short_secret = "short-test-secret"
        env = os.environ.copy()
        env["OWNER_SECRET"] = short_secret
        env["HOST"] = "127.0.0.1"
        env["PORT"] = "0"

        completed = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("python_core.py"))],
            env=env,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        output = completed.stdout + completed.stderr
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("OWNER_SECRET must be configured with at least 32 characters.", output)
        self.assertNotIn(short_secret, output)

    def test_startup_rejects_whitespace_padded_owner_secret_without_echoing_it(self):
        padded_secret = f" {TEST_SECRET} "
        previous_secret = os.environ.get("OWNER_SECRET")
        previous_host = os.environ.get("HOST")
        previous_port = os.environ.get("PORT")
        os.environ["OWNER_SECRET"] = padded_secret
        os.environ["HOST"] = "127.0.0.1"
        os.environ["PORT"] = "8788"
        original_server = python_core.SecureThreadingHTTPServer

        class UnexpectedServer:
            def __init__(self, *args, **kwargs):
                raise AssertionError("server must not start with whitespace-padded owner secret")

        python_core.SecureThreadingHTTPServer = UnexpectedServer
        try:
            with self.assertRaises(SystemExit) as raised:
                python_core.main()
            self.assertEqual(
                str(raised.exception),
                "OWNER_SECRET must not contain surrounding whitespace.",
            )
            self.assertNotIn(TEST_SECRET, str(raised.exception))
        finally:
            python_core.SecureThreadingHTTPServer = original_server
            if previous_secret is None:
                os.environ.pop("OWNER_SECRET", None)
            else:
                os.environ["OWNER_SECRET"] = previous_secret
            if previous_host is None:
                os.environ.pop("HOST", None)
            else:
                os.environ["HOST"] = previous_host
            if previous_port is None:
                os.environ.pop("PORT", None)
            else:
                os.environ["PORT"] = previous_port
