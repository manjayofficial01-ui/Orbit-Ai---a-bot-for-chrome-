import io
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import install
import orbit_reach_host as bridge


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.log = Path(self.temp.name) / "argv.jsonl"
        self.env = mock.patch.dict(os.environ, {"FAKE_REACH_LOG": str(self.log), "FAKE_REACH_MODE": "success"})
        self.env.start()
        self.cli = bridge.AgentReachCLI(Path(sys.executable), [str(ROOT / "tests" / "fake_cli.py")])

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def calls(self):
        return [json.loads(line) for line in self.log.read_text(encoding="utf-8").splitlines()] if self.log.exists() else []

    def test_status_filters_management_actions_and_update_metadata(self):
        result = bridge.handle({"op": "status"}, self.cli)
        self.assertTrue(result["ok"])
        self.assertNotIn("commands", result)
        self.assertNotIn("meta", result)
        youtube = next(c for c in result["channels"] if c["name"] == "youtube")
        self.assertEqual([a["name"] for a in youtube["actions"]], ["read"])
        self.assertEqual(self.calls(), [["channels"]])

    def test_search_uses_declared_fixed_argv_and_argument_separator(self):
        query = "--backend exa; calc & echo unsafe"
        result = bridge.handle({"op": "search", "channel": "web", "query": query, "limit": 3}, self.cli)
        self.assertTrue(result["ok"])
        self.assertEqual(self.calls()[1], ["web", "search", "--limit", "3", "--timeout", "60", "--", query])

    def test_automatic_read_is_url_only_and_fixed(self):
        result = bridge.handle({"op": "read", "target": "https://example.com/article"}, self.cli)
        self.assertEqual(result["action"], "read")
        self.assertEqual(self.calls()[0], ["read", "--timeout", "60", "--", "https://example.com/article"])

    def test_rejects_management_extra_parameters_and_unsafe_urls_without_cli(self):
        requests = [{"op": "login", "channel": "web"}, {"op": "search", "channel": "web", "query": "x", "backend": "exa"}, {"op": "read", "target": "file:///etc/passwd"}, {"op": "read", "target": "https://user:secret@example.com/"}, {"op": "search", "query": "x", "limit": True}]
        for request in requests:
            with self.subTest(request=request), self.assertRaises(bridge.BridgeError):
                bridge.handle(request, self.cli)
        self.assertEqual(self.calls(), [])

    def test_unsupported_channel_never_executes_action(self):
        with self.assertRaises(bridge.BridgeError) as caught:
            bridge.handle({"op": "search", "channel": "not-real", "query": "x"}, self.cli)
        self.assertEqual(caught.exception.code, "UNSUPPORTED_CHANNEL")
        self.assertEqual(self.calls(), [["channels"]])

    def test_raw_payload_and_credentials_never_cross_bridge(self):
        result = bridge.handle({"op": "search", "query": "x"}, self.cli)
        serialized = json.dumps(result)
        self.assertNotIn("raw-secret", serialized)
        self.assertNotIn("do-not-forward", serialized)
        self.assertNotIn("raw", result["items"][0])
        clean = bridge.sanitize_result({"schema_version": 1, "ok": True, "channel": "web", "action": "search", "items": [{"url": "https://user:secret@example.com/"}], "meta": {}}, {"op": "search"})
        self.assertEqual(clean["items"][0]["url"], "")

    def test_structured_upstream_error_is_not_a_host_protocol_failure(self):
        os.environ["FAKE_REACH_MODE"] = "failure"
        result = bridge.handle({"op": "search", "query": "x"}, self.cli)
        self.assertFalse(result["ok"])
        self.assertNotIn("bridge_error", result)
        self.assertEqual(result["error"]["code"], "NEED_LOGIN")
        self.assertNotIn("password@", json.dumps(result))

    def test_malformed_output_and_command_failure_are_bounded_errors(self):
        for mode, code in [("malformed", "CLI_INVALID_OUTPUT"), ("badexit", "CLI_FAILED")]:
            with self.subTest(mode=mode):
                os.environ["FAKE_REACH_MODE"] = mode
                with self.assertRaises(bridge.BridgeError) as caught:
                    self.cli._run(["channels"], 5)
                self.assertEqual(caught.exception.code, code)
                self.assertNotIn("sensitive", caught.exception.message)

    def test_timeout_kills_fake_cli(self):
        os.environ["FAKE_REACH_MODE"] = "timeout"
        with self.assertRaises(bridge.BridgeError) as caught:
            self.cli._run(["channels"], 1)
        self.assertEqual(caught.exception.code, "CLI_TIMEOUT")

    def test_output_limit_and_missing_executable(self):
        os.environ["FAKE_REACH_MODE"] = "large"
        with self.assertRaises(bridge.BridgeError) as caught:
            self.cli._run(["channels"], 5)
        self.assertEqual(caught.exception.code, "OUTPUT_LIMIT")
        missing = bridge.AgentReachCLI(Path(self.temp.name) / "missing.exe")
        with self.assertRaises(bridge.BridgeError) as caught:
            missing._run(["channels"], 1)
        self.assertEqual(caught.exception.code, "CLI_NOT_FOUND")

    def test_native_framing_and_size_limit(self):
        stream = io.BytesIO()
        bridge.write_message(stream, {"op": "status"})
        stream.seek(0)
        self.assertEqual(bridge.read_message(stream), {"op": "status"})
        oversized = struct.pack("<I", bridge.MAX_MESSAGE_BYTES + 1)
        with self.assertRaises(bridge.BridgeError):
            bridge.read_message(io.BytesIO(oversized))

    def test_installer_accepts_only_one_exact_extension_origin(self):
        self.assertEqual(install.extension_id("a" * 32), "a" * 32)
        with self.assertRaises(Exception):
            install.extension_id("https://evil.example")
        manifest = install.build_manifest("a" * 32, Path("C:/bridge/host.cmd"))
        self.assertEqual(manifest["allowed_origins"], ["chrome-extension://" + "a" * 32 + "/"])


if __name__ == "__main__":
    unittest.main()
