import http.client
import json
import os
import socket
import threading
import unittest
from http.server import ThreadingHTTPServer

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
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=2)
        os.environ.pop("OWNER_SECRET", None)

    def request(self, body=None, headers=None, raw_path="/v1/execute"):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=8)
        connection.request("POST", raw_path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = response.status, response.getheaders(), response.read()
        connection.close()
        return result

    def test_requires_owner_secret(self):
        status, _, body = self.request(
            json.dumps({"task": "summarize", "text": "hello"}),
            {"Content-Type": "application/json"},
        )
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
            sock.sendall(raw)
            chunks = []
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                chunks.append(chunk)
        response = b"".join(chunks).decode("iso-8859-1")
        self.assertIn("400", response.split("\r\n", 1)[0])

    def test_rejects_transfer_encoding(self):
        status, _, body = self.request(
            '{"task":"summarize","text":"hello"}',
            {"X-Owner-Secret": TEST_SECRET, "Transfer-Encoding": "chunked",
             "Content-Type": "application/json"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "INVALID_REQUEST_FRAMING")

    def test_rejects_wrong_content_type(self):
        status, _, body = self.request(
            '{"task":"summarize","text":"hello"}',
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "text/plain"},
        )
        self.assertEqual(status, 415)
        self.assertEqual(json.loads(body)["code"], "UNSUPPORTED_MEDIA_TYPE")

    def test_rejects_short_body_read(self):
        status, _, body = self.request(
            '{"task":"summarize","text":"hello"}',
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json",
             "Content-Length": "100"},
        )
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
        status, _, body = self.request(
            "{}",
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json",
             "Content-Length": "9" * 5000},
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "INVALID_CONTENT_LENGTH")

    def test_rejects_duplicate_json_keys(self):
        status, _, body = self.request(
            '{"task":"summarize","task":"classify_text","text":"hello"}',
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "DUPLICATE_JSON_KEY")

    def test_success_responses_disable_caching(self):
        status, headers, body = self.request(
            json.dumps({"task": "summarize", "text": "One. Two."}),
            {"X-Owner-Secret": TEST_SECRET, "Content-Type": "application/json"},
        )
        self.assertEqual(status, 200)
        self.assertIn(("Cache-Control", "no-store"), headers)
        self.assertTrue(json.loads(body)["ok"])


if __name__ == "__main__":
    unittest.main()


class HybridDeploymentConfigTests(unittest.TestCase):
    def test_procfile_starts_the_actual_python_http_server(self):
        from pathlib import Path
        procfile = Path(__file__).with_name("Procfile").read_text(encoding="utf-8").strip()
        self.assertEqual(procfile, "web: HOST=0.0.0.0 python python_core.py")

