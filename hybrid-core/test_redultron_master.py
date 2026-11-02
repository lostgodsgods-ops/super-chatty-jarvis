import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JAVA_SOURCE = ROOT / "hybrid-core" / "RedultronCoreMaster.java"
BRAIN_SCRIPT = ROOT / "hybrid-core" / "redultron_brain.py"


class RedultronMasterBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which("javac") or not shutil.which("java"):
            raise unittest.SkipTest("Java 17+ toolchain is required")
        cls.build_dir = tempfile.TemporaryDirectory(prefix="redultron-java-")
        compile_result = subprocess.run(
            ["javac", "-encoding", "UTF-8", "-d", cls.build_dir.name, str(JAVA_SOURCE)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if compile_result.returncode:
            raise AssertionError(compile_result.stderr or compile_result.stdout)
    
    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "build_dir"):
            cls.build_dir.cleanup()

    def run_brain(self, command):
        return subprocess.run(
            [sys.executable, str(BRAIN_SCRIPT), command],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=15,
        )

    def test_python_brain_health_command_returns_json(self):
        result = self.run_brain("health")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(payload["data"]["brain"], "online")

    def test_python_brain_help_lists_only_supported_commands(self):
        result = self.run_brain("help")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")
        self.assertIn("summarize", payload["data"]["commands"])
        self.assertNotIn("shell", payload["data"]["commands"])

    def test_python_brain_reuses_existing_core_transform(self):
        result = self.run_brain("summarize First sentence. Second sentence.")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["data"], "First sentence. Second sentence.")

    def test_python_brain_rejects_unknown_commands_without_echoing_input(self):
        result = self.run_brain("run_shell do-not-run-this")
        self.assertEqual(result.returncode, 2)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "REJECTED")
        self.assertNotIn("do-not-run-this", result.stdout)

    def test_python_brain_rejects_empty_and_oversized_transform_input(self):
        empty = self.run_brain("summarize")
        oversized = self.run_brain("summarize " + ("x" * 16001))
        self.assertEqual(empty.returncode, 2)
        self.assertEqual(oversized.returncode, 2)
        self.assertEqual(json.loads(empty.stdout)["status"], "REJECTED")
        self.assertEqual(json.loads(oversized.stdout)["status"], "REJECTED")

    def run_master(self, *args, env=None):
        merged_env = os.environ.copy()
        if env:
            merged_env.update(env)
        return subprocess.run(
            ["java", "-cp", self.build_dir.name, "RedultronCoreMaster", *args],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=75,
            env=merged_env,
        )

    def test_no_arguments_prints_usage_without_starting_brain(self):
        result = self.run_master()
        self.assertEqual(result.returncode, 0)
        self.assertIn("Awaiting Command", result.stdout)

    def test_health_command_returns_structured_json(self):
        result = self.run_master("health")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout.split("=== REDULTRON CORE EXECUTION RESULT ===", 1)[1].split("[EXIT CODE]", 1)[0].strip())
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(payload["data"]["brain"], "online")

    def test_allowlisted_transform_runs_through_existing_python_core(self):
        result = self.run_master("summarize", "First sentence.", "Second sentence.")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("First sentence. Second sentence.", result.stdout)

    def test_unknown_command_fails_closed(self):
        result = self.run_master("run_shell", "echo unsafe")
        self.assertEqual(result.returncode, 2)
        self.assertIn("REJECTED", result.stdout)
        self.assertNotIn("unsafe", result.stdout)

    def test_command_length_is_bounded(self):
        result = self.run_master("summarize", "x" * 10001)
        self.assertEqual(result.returncode, 2)
        self.assertIn("Invalid command", result.stderr)


if __name__ == "__main__":
    unittest.main()
