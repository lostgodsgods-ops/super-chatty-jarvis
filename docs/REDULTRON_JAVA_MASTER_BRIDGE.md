# REDULTRON Java Master / Python Brain Bridge

## Purpose

hybrid-core/RedultronCoreMaster.java is a local Java command-line entry point. It starts
hybrid-core/redultron_brain.py as a child process and passes one bounded command argument.
The Python adapter reuses process_task from hybrid-core/python_core.py so local CLI behavior
and the existing Python HTTP sidecar share the same deterministic task implementations.

This bridge is not a second server, does not replace the Cloudflare Worker adapter, and
does not establish production authentication or deployment readiness.

## Build

From the repository root with Java 17+ and Python 3.12+ installed:

```bash
javac -encoding UTF-8 -d build/java hybrid-core/RedultronCoreMaster.java
java -cp build/java RedultronCoreMaster health
java -cp build/java RedultronCoreMaster status
java -cp build/java RedultronCoreMaster help
```

The Python executable defaults to python3. Set REDULTRON_PYTHON to an alternate
single executable path when required. REDULTRON_TIMEOUT_SECONDS accepts 1–120 seconds;
invalid values fall back to the 60-second default.

## Supported commands

- health — report local adapter availability.
- status — report the restricted local execution mode.
- help — list supported commands.
- summarize <text>
- extract_keywords <text>
- classify_text <text>

The three text transforms are delegated to the existing Python Core allowlist. Unknown
commands, empty input, and oversized input are rejected. No shell, eval, arbitrary Python,
network, credential, or production mutation command is exposed through this bridge.

## Runtime safeguards

- Java starts the Python process with an argument vector; it does not invoke a shell.
- Command input is capped at 10,000 characters.
- Python Core task input retains its 16,000-character validation.
- Child execution has a bounded timeout and exit-code propagation.
- stdout and stderr are drained concurrently; retained output is capped at 1 MB per stream.
- Error output is sanitized by the Python adapter.
- The Java wrapper does not read or receive OWNER_SECRET.
- Production hybrid execution continues to use the authenticated Worker → Python HTTPS adapter.
- No deployment, secret synchronization, D1/KV mutation, or owner-authentication change is performed.

## Verification

The repository CI workflow installs Java 17 and runs the existing Node suite plus Python
Hybrid Core tests. test_redultron_master.py compiles the Java entry point and exercises
health, no-argument behavior, an allowlisted transform, unknown-command rejection,
and command-length rejection.

A passing local bridge test proves only the local Java/Python CLI path. It does not prove
Worker-to-Render authenticated execution, live D1 persistence, or production deployment.