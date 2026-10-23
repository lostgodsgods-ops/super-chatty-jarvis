import http.client
import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer

from python_core import Handler, process_task


TEST_SECRET = "test-only-secret-value-at-least-32-chars"


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True


class HybridCoreTests(unittest.TestCase):
    def test_summarize_is_bounded_to_three_sentences(self):
        result = process_task("summarize", "One. Two. Three. Four.")
        self.assertEqual(result, "One. Two. Three.")

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
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
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
        status, _, body = self.request(
            '{"task":"summarize","text":"hello"}',
            [("X-Owner-Secret", TEST_SECRET), ("Content-Type", "application/json"),
             ("Content-Length", "35"), ("Content-Length", "1")],
        )
        self.assertIn(status, (400, 413))
        self.assertNotEqual(json.loads(body).get("ok"), True)

    def test_rejects_transfer_encoding(self):
        status, _, body = self.request(
            '{"task":"summarize","text":"hello"}',
            {"X-Owner-Secret": TEST_SECRET, "Transfer-Encoding": "chunked",
             "Content-Type": "application/json"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "UNSUPPORTED_TRANSFER_ENCODING")

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
