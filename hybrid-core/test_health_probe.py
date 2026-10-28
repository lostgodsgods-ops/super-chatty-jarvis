import io
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

import health_probe


class Response:
    def __init__(self, status=200, body=b'{"ok":true,"service":"redultron-python-core"}', headers=None):
        self.status = status
        self.body = body
        self.headers = headers or {"Content-Type": "application/json; charset=utf-8"}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, n=-1):
        return self.body if n < 0 else self.body[:n]

    def getheader(self, name, default=None):
        return self.headers.get(name, default)


class HealthProbeTests(unittest.TestCase):
    @patch("health_probe.urlopen")
    def test_retries_transient_503_then_accepts_exact_health_schema(self, open_url):
        open_url.side_effect = [
            HTTPError("https://core.invalid/health", 503, "unavailable", {}, io.BytesIO(b"<html>sleeping</html>")),
            Response(),
        ]
        with patch("health_probe.time.sleep") as sleep:
            result = health_probe.check_health("https://core.invalid", attempts=3, timeout=1, backoff=0.1)
        self.assertEqual(result["attempts"], 2)
        self.assertEqual(open_url.call_count, 2)
        sleep.assert_called_once_with(0.1)

    @patch("health_probe.urlopen")
    def test_does_not_retry_non_transient_401(self, open_url):
        open_url.side_effect = HTTPError("https://core.invalid/health", 401, "unauthorized", {}, io.BytesIO(b"{}"))
        with self.assertRaisesRegex(health_probe.HealthProbeError, "HTTP_401"):
            health_probe.check_health("https://core.invalid", attempts=3, timeout=1, backoff=0.1)
        self.assertEqual(open_url.call_count, 1)

    @patch("health_probe.urlopen")
    def test_rejects_html_even_when_http_200(self, open_url):
        open_url.return_value = Response(body=b"<html>proxy page</html>", headers={"Content-Type": "text/html"})
        with self.assertRaisesRegex(health_probe.HealthProbeError, "INVALID_HEALTH_RESPONSE"):
            health_probe.check_health("https://core.invalid", attempts=3, timeout=1, backoff=0.1)
        self.assertEqual(open_url.call_count, 1)

    @patch("health_probe.urlopen")
    def test_rejects_wrong_json_schema(self, open_url):
        open_url.return_value = Response(body=b'{"ok":true,"service":"other"}')
        with self.assertRaisesRegex(health_probe.HealthProbeError, "HEALTH_SCHEMA_MISMATCH"):
            health_probe.check_health("https://core.invalid", attempts=3, timeout=1, backoff=0.1)
        self.assertEqual(open_url.call_count, 1)

    @patch("health_probe.urlopen")
    def test_stops_after_maximum_three_transient_failures(self, open_url):
        open_url.side_effect = [
            HTTPError("https://core.invalid/health", 502, "bad gateway", {}, io.BytesIO(b"")),
            HTTPError("https://core.invalid/health", 503, "unavailable", {}, io.BytesIO(b"")),
            HTTPError("https://core.invalid/health", 504, "gateway timeout", {}, io.BytesIO(b"")),
        ]
        with patch("health_probe.time.sleep"):
            with self.assertRaisesRegex(health_probe.HealthProbeError, "HTTP_504"):
                health_probe.check_health("https://core.invalid", attempts=3, timeout=1, backoff=0.1)
        self.assertEqual(open_url.call_count, 3)

    @patch("health_probe.urlopen")
    def test_rejects_insecure_or_credential_bearing_endpoint(self, open_url):
        for url in ("http://core.invalid", "https://user:pass@core.invalid", "https://core.invalid/?token=x"):
            with self.subTest(url=url):
                with self.assertRaisesRegex(health_probe.HealthProbeError, "INVALID_ENDPOINT_CONFIGURATION"):
                    health_probe.check_health(url, attempts=3, timeout=1, backoff=0.1)
        open_url.assert_not_called()


if __name__ == "__main__":
    unittest.main()
