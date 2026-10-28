"""Bounded, fail-closed health probe for the REDULTRON Python Core."""
from __future__ import annotations

import json
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

RETRYABLE_STATUSES = {502, 503, 504}
EXPECTED_SERVICE = "redultron-python-core"
MAX_ATTEMPTS = 3
MAX_TIMEOUT_SECONDS = 5
MAX_BACKOFF_SECONDS = 1.0


class HealthProbeError(RuntimeError):
    """Safe, bounded health probe failure with no response-body leakage."""


def _health_url(base_url: str) -> str:
    parts = urlsplit(base_url)
    if (parts.scheme != "https" or not parts.hostname or parts.username or parts.password
            or parts.query or parts.fragment or parts.path not in ("", "/", "/v1/execute")):
        raise HealthProbeError("INVALID_ENDPOINT_CONFIGURATION")
    return urlunsplit((parts.scheme, parts.netloc, "/health", "", ""))


def check_health(base_url: str, *, attempts: int = MAX_ATTEMPTS,
                 timeout: float = MAX_TIMEOUT_SECONDS, backoff: float = 0.25) -> dict:
    if not isinstance(attempts, int) or not 1 <= attempts <= MAX_ATTEMPTS:
        raise HealthProbeError("INVALID_RETRY_CONFIGURATION")
    if not (0 < timeout <= MAX_TIMEOUT_SECONDS) or not (0 <= backoff <= MAX_BACKOFF_SECONDS):
        raise HealthProbeError("INVALID_RETRY_CONFIGURATION")
    url = _health_url(base_url)
    request = Request(url, headers={"Accept": "application/json"}, method="GET")
    for attempt in range(1, attempts + 1):
        try:
            with urlopen(request, timeout=timeout) as response:
                status = getattr(response, "status", 200)
                content_type = response.getheader("Content-Type", "").split(";", 1)[0].strip().lower()
                if status != 200:
                    raise HealthProbeError("HTTP_" + str(status))
                if content_type != "application/json":
                    raise HealthProbeError("INVALID_HEALTH_RESPONSE")
                try:
                    payload = json.loads(response.read(4096).decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    raise HealthProbeError("INVALID_HEALTH_RESPONSE") from None
                if not isinstance(payload, dict) or payload.get("ok") is not True or payload.get("service") != EXPECTED_SERVICE:
                    raise HealthProbeError("HEALTH_SCHEMA_MISMATCH")
                return {"ok": True, "attempts": attempt, "service": EXPECTED_SERVICE}
        except HTTPError as error:
            status = int(error.code)
            if status not in RETRYABLE_STATUSES or attempt >= attempts:
                raise HealthProbeError("HTTP_" + str(status)) from None
        except URLError:
            # Network and DNS errors can indicate a wrong endpoint/configuration; do not hide them with retries.
            raise HealthProbeError("NETWORK_ERROR") from None
        except TimeoutError:
            raise HealthProbeError("REQUEST_TIMEOUT") from None
        except HealthProbeError as error:
            # Retry only transient HTTP statuses. All schema, content-type and configuration errors fail closed.
            if str(error) not in {"HTTP_502", "HTTP_503", "HTTP_504"} or attempt >= attempts:
                raise
        if attempt < attempts:
            time.sleep(min(backoff * (2 ** (attempt - 1)), MAX_BACKOFF_SECONDS))
    raise HealthProbeError("RETRY_BUDGET_EXHAUSTED")


def main() -> int:
    import os
    base_url = os.environ.get("PYTHON_CORE_URL", "")
    try:
        result = check_health(base_url)
    except HealthProbeError as error:
        print("FAIL: Python Core health probe: " + str(error), file=sys.stderr)
        return 1
    print(f"PASS: Python Core health schema verified; attempts={result['attempts']}; service={result['service']}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
