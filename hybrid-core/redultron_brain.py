"""Safe CLI bridge into the existing REDULTRON Python Core.

This module is a local command adapter only. It does not expose shell execution,
network access, credentials, or owner-authenticated production operations.
"""
from __future__ import annotations

import json
import sys
import time

from python_core import ALLOWED_TASKS, MAX_TEXT_CHARS, process_task


def emit(status: str, message: str, data=None) -> None:
    print(json.dumps({
        "status": status,
        "message": message,
        "data": data,
        "timestamp": int(time.time()),
    }, ensure_ascii=False, separators=(",", ":")))


def dispatch(raw_command: str):
    command = raw_command.strip()
    if not command:
        raise ValueError("COMMAND_REQUIRED")

    name, separator, argument = command.partition(" ")
    name = name.strip().lower()
    argument = argument.strip() if separator else ""

    if name == "help":
        return {
            "commands": ["help", "health", "status"] + sorted(ALLOWED_TASKS),
            "usage": "summarize <text> | extract_keywords <text> | classify_text <text>",
        }
    if name == "health":
        return {
            "brain": "online",
            "execution": "bounded-local-cli",
            "allowed_tasks": sorted(ALLOWED_TASKS),
        }
    if name == "status":
        return {
            "core": "REDULTRON",
            "version": "3.0",
            "mode": "restricted",
            "production_access": False,
        }
    if name not in ALLOWED_TASKS:
        raise ValueError("COMMAND_NOT_ALLOWLISTED")
    if not argument or len(argument) > MAX_TEXT_CHARS:
        raise ValueError("HYBRID_TEXT_LENGTH_INVALID")

    return process_task(name, argument)


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1:
        emit("REJECTED", "EXPECTED_ONE_COMMAND_ARGUMENT")
        return 2

    try:
        result = dispatch(argv[0])
        emit("PASS", "COMMAND_PROCESSED", result)
        return 0
    except ValueError as exc:
        code = str(exc)
        if code not in {
            "COMMAND_REQUIRED",
            "COMMAND_NOT_ALLOWLISTED",
            "HYBRID_TASK_NOT_ALLOWED",
            "HYBRID_TEXT_LENGTH_INVALID",
        }:
            code = "COMMAND_REJECTED"
        emit("REJECTED", code)
        return 2
    except Exception:
        # Never expose tracebacks or environment/configuration details to stdout.
        emit("FAIL", "INTERNAL_EXECUTION_ERROR")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
