#!/usr/bin/env python3
"""Restricted Orbit native-messaging host for Agent Reach search/read only."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

HOST_NAME = "ai.orbit.agent_reach"
SCHEMA_VERSION = 1
MAX_MESSAGE_BYTES = 64 * 1024
MAX_OUTPUT_BYTES = 4 * 1024 * 1024
MAX_ITEMS = 10
CONFIG_PATH = Path(__file__).resolve().with_name("bridge-config.json")
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")


class BridgeError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code, self.message, self.hint = code, message, hint


def clean(value: object, limit: int = 500) -> str:
    if value is None or not isinstance(value, (str, int, float)):
        return ""
    text = str(value)
    text = "".join(ch for ch in text if ch in "\t\n\r" or (ord(ch) >= 32 and ord(ch) != 127))
    text = re.sub(r"(?i)(https?://)([^\s/@:]+):([^\s@]+)@", r"\1<credentials>@", text)
    return text.strip()[:limit]


def identifier(value: object) -> str:
    text = clean(value, 64)
    return text if NAME_RE.fullmatch(text) else ""


def public_url(value: object) -> str:
    if not isinstance(value, str) or len(value) > 2048 or any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
        return ""
    try:
        parsed = urlsplit(value.strip())
        _ = parsed.port
        if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            return ""
    except (ValueError, UnicodeError):
        return ""
    return value.strip()


def normalize_request(value: object) -> dict:
    if not isinstance(value, dict):
        raise BridgeError("BAD_INPUT", "Reach request must be an object.")
    op = value.get("op")
    if op not in ("status", "search", "read"):
        raise BridgeError("BAD_INPUT", "Only Reach status, search, and read are allowed.")
    allowed = {"status": {"op"}, "search": {"op", "channel", "query", "limit"}, "read": {"op", "channel", "target"}}[op]
    unknown = set(value) - allowed
    if unknown:
        raise BridgeError("BAD_INPUT", "Unsupported Reach parameter: " + sorted(unknown)[0])
    if op == "status":
        return {"op": op}
    raw_channel = value.get("channel", "")
    channel = identifier(raw_channel) if raw_channel else ""
    if raw_channel and not channel:
        raise BridgeError("BAD_INPUT", "Invalid Reach channel name.")
    if op == "search":
        query = value.get("query")
        if not isinstance(query, str) or not query.strip() or len(query) > 500 or any(ord(ch) < 32 or ord(ch) == 127 for ch in query):
            raise BridgeError("BAD_INPUT", "Reach query must be one non-empty line of at most 500 characters.")
        limit = value.get("limit", 5)
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 10:
            raise BridgeError("BAD_INPUT", "Reach result limit must be an integer from 1 to 10.")
        return {"op": op, "channel": channel or "web", "query": query.strip(), "limit": limit}
    target = value.get("target")
    if not isinstance(target, str) or not target.strip() or len(target) > 2048 or any(ord(ch) < 32 or ord(ch) == 127 for ch in target):
        raise BridgeError("BAD_INPUT", "Reach target must be one non-empty line.")
    target = target.strip()
    if not channel:
        url = public_url(target)
        if not url:
            raise BridgeError("BAD_INPUT", "Automatic Reach read requires a public HTTP(S) URL without credentials.")
        return {"op": op, "target": url}
    if "://" in target and not public_url(target):
        raise BridgeError("BAD_INPUT", "Reach URLs must be HTTP(S) URLs without embedded credentials.")
    if channel == "web" and not public_url(target):
        raise BridgeError("BAD_INPUT", "Web read requires a public HTTP(S) URL.")
    return {"op": op, "channel": channel, "target": target}

def public_capabilities(channels: list) -> dict:
    output = []
    for channel in channels[:40]:
        actions = []
        for action in channel.get("actions", [])[:30]:
            if action.get("name") not in ("search", "read"):
                continue
            actions.append({
                "name": action["name"], "help": clean(action.get("help"), 240),
                "backends": [identifier(x) for x in action.get("backends", [])[:10] if identifier(x)],
                "public_web": [clean(x, 100) for x in action.get("public_web", [])[:20]],
            })
        if not actions:
            continue
        login = channel.get("login")
        output.append({
            "name": channel["name"], "description": clean(channel.get("description"), 240),
            "level": clean(channel.get("level"), 30),
            "login": {"via": clean(login.get("via"), 40), "logged_in": login.get("logged_in") if isinstance(login.get("logged_in"), bool) else None} if isinstance(login, dict) else None,
            "actions": actions,
        })
    return {"schema_version": SCHEMA_VERSION, "ok": True, "channels": output}


def sanitize_result(payload: object, request: dict) -> dict:
    if not isinstance(payload, dict) or payload.get("schema_version") != SCHEMA_VERSION or not isinstance(payload.get("ok"), bool):
        raise BridgeError("CLI_INVALID_OUTPUT", "Agent Reach returned an invalid result envelope.", "Run agent-reach version and confirm it provides the JSON interface.")
    if payload.get("action") != request["op"]:
        raise BridgeError("CLI_INVALID_OUTPUT", "Agent Reach returned an unexpected action result.")
    ok = payload["ok"]
    raw_items = payload.get("items", [])
    if ok and not isinstance(raw_items, list):
        raise BridgeError("CLI_INVALID_OUTPUT", "Agent Reach returned malformed result items.")
    result = {"schema_version": SCHEMA_VERSION, "ok": ok, "channel": identifier(payload.get("channel")), "action": request["op"], "backend": identifier(payload.get("backend")), "items": [], "error": None, "meta": {"elapsed_ms": 0, "attempts": []}}
    if not ok:
        error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
        result["error"] = {"code": clean(error.get("code"), 50) or "UPSTREAM_BROKEN", "message": clean(error.get("message"), 500) or "Agent Reach request failed.", "hint": clean(error.get("hint"), 500)}
    for item in (raw_items if ok else [])[:MAX_ITEMS]:
        if not isinstance(item, dict):
            continue
        result["items"].append({"title": clean(item.get("title"), 300), "url": public_url(item.get("url")), "author": clean(item.get("author"), 200), "published_at": clean(item.get("published_at"), 100), "text": clean(item.get("text"), 12000)})
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    elapsed = meta.get("elapsed_ms")
    result["meta"]["elapsed_ms"] = max(0, min(120000, elapsed)) if isinstance(elapsed, int) and not isinstance(elapsed, bool) else 0
    attempts = meta.get("attempts") if isinstance(meta.get("attempts"), list) else []
    result["meta"]["attempts"] = [{"backend": identifier(a.get("backend")), "result": clean(a.get("result"), 50), "skipped": a.get("skipped") is True} for a in attempts[:8] if isinstance(a, dict)]
    return result

def validate_cli_path(value: object) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise BridgeError("CLI_NOT_FOUND", "Agent Reach CLI path is empty.")
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise BridgeError("CLI_CONFIG_INVALID", "The saved Agent Reach CLI path must be absolute.", "Rerun the Orbit Reach bridge installer.")
    try:
        path = path.resolve(strict=True)
    except OSError as exc:
        raise BridgeError("CLI_NOT_FOUND", "Agent Reach CLI was not found at its saved location.", "Install Agent Reach or rerun the bridge installer with --cli.") from exc
    if not path.is_file() or (os.name == "nt" and path.suffix.lower() != ".exe") or (os.name != "nt" and not os.access(path, os.X_OK)):
        raise BridgeError("CLI_NOT_FOUND", "The saved Agent Reach CLI is not a directly executable file.", "Select the agent-reach executable installed by uv; do not select a shell script or .cmd file.")
    return path


def find_cli() -> Path:
    if CONFIG_PATH.exists():
        try:
            config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise BridgeError("CLI_CONFIG_INVALID", "The Orbit Reach bridge configuration is unreadable.", "Rerun the one-time bridge installer.") from exc
        if not isinstance(config, dict) or set(config) != {"cli_path"}:
            raise BridgeError("CLI_CONFIG_INVALID", "The Orbit Reach bridge configuration is invalid.", "Rerun the one-time bridge installer; it stores only cli_path.")
        return validate_cli_path(config.get("cli_path"))
    candidates = [shutil.which("agent-reach")]
    if os.name == "nt":
        candidates.extend([str(Path.home() / ".local" / "bin" / "agent-reach.exe"), str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "agent-reach" / "agent-reach.exe")])
    else:
        candidates.extend([str(Path.home() / ".local" / "bin" / "agent-reach"), "/opt/homebrew/bin/agent-reach", "/usr/local/bin/agent-reach"])
    for candidate in candidates:
        if candidate:
            try:
                return validate_cli_path(candidate)
            except BridgeError:
                continue
    raise BridgeError("CLI_NOT_FOUND", "Agent Reach CLI is not installed or cannot be found.", "Install Agent Reach from its official GitHub release, then rerun the Orbit bridge installer with --cli if needed.")


class AgentReachCLI:
    def __init__(self, executable: Path | None = None, prefix: list[str] | None = None):
        self.command = [str(executable or find_cli()), *(prefix or [])]

    def _run(self, args: list[str], timeout: int) -> dict:
        argv = [*self.command, *args]
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
        env = os.environ.copy()
        env["PYTHONIOENCODING"], env["PYTHONUTF8"] = "utf-8", "1"
        try:
            with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
                process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, shell=False, env=env, creationflags=flags)
                try:
                    returncode = process.wait(timeout=timeout)
                except subprocess.TimeoutExpired as exc:
                    process.kill()
                    process.wait()
                    raise BridgeError("CLI_TIMEOUT", "Agent Reach exceeded the local bridge deadline.", "Retry once; do not repeat a timed-out request in a loop.") from exc
                stdout.seek(0)
                output = stdout.read(MAX_OUTPUT_BYTES + 1)
            if len(output) > MAX_OUTPUT_BYTES:
                raise BridgeError("OUTPUT_LIMIT", "Agent Reach output exceeded the 4 MB bridge limit.")
        except FileNotFoundError as exc:
            raise BridgeError("CLI_NOT_FOUND", "Agent Reach CLI could not be started.", "Rerun the bridge installer with the resolved CLI path.") from exc
        except OSError as exc:
            raise BridgeError("CLI_START_FAILED", "Agent Reach CLI could not be started.", "Check the saved executable path and local installation.") from exc
        if returncode not in (0, 1):
            raise BridgeError("CLI_FAILED", "Agent Reach exited without a usable structured result.", "Run agent-reach doctor in your terminal for local setup details.")
        try:
            payload = json.loads(output.decode("utf-8"))
        except (UnicodeError, ValueError) as exc:
            raise BridgeError("CLI_INVALID_OUTPUT", "Agent Reach did not return one valid UTF-8 JSON object.", "Use Agent Reach 1.6 or later; run agent-reach doctor in your terminal.") from exc
        if not isinstance(payload, dict):
            raise BridgeError("CLI_FAILED", "Agent Reach exited without a usable structured result.", "Run agent-reach doctor in your terminal for local setup details.")
        return payload

    def channels(self) -> list:
        payload = self._run(["channels"], 15)
        channels = payload.get("channels")
        if payload.get("ok") is not True or not isinstance(channels, list):
            raise BridgeError("CLI_STATUS_FAILED", "Agent Reach could not report its channels.", "Run agent-reach setup and agent-reach doctor in your terminal.")
        for channel in channels[:40]:
            if not isinstance(channel, dict) or not identifier(channel.get("name")) or not isinstance(channel.get("actions"), list):
                raise BridgeError("CLI_INVALID_OUTPUT", "Agent Reach returned malformed channel metadata.")
            for action in channel["actions"][:30]:
                if not isinstance(action, dict) or not identifier(action.get("name")) or not isinstance(action.get("params"), list):
                    raise BridgeError("CLI_INVALID_OUTPUT", "Agent Reach returned malformed action metadata.")
        return channels[:40]

    def status(self) -> dict:
        return public_capabilities(self.channels())

    def execute(self, request: dict) -> dict:
        if request["op"] == "read" and not request.get("channel"):
            payload = self._run(["read", "--timeout", "60", "--", request["target"]], 75)
            return sanitize_result(payload, request)
        channel_name = request["channel"]
        channel = next((c for c in self.channels() if c["name"] == channel_name), None)
        action = next((a for a in channel["actions"] if a.get("name") == request["op"]), None) if channel else None
        if action is None:
            raise BridgeError("UNSUPPORTED_CHANNEL", f"Agent Reach does not declare {channel_name} {request['op']}.", "Choose a search/read action reported by agent-reach channels.")
        params = {}
        for param in action["params"]:
            if isinstance(param, dict) and identifier(param.get("name")):
                params[param["name"]] = param
        supplied = {key: request[key] for key in ("query", "target", "limit") if key in request}
        unsupported = set(supplied) - set(params)
        if unsupported:
            raise BridgeError("BAD_INPUT", f"The declared action does not accept {sorted(unsupported)[0]}.")
        required = [p for p in action["params"] if isinstance(p, dict) and p.get("required")]
        if any(p.get("name") not in supplied for p in required):
            raise BridgeError("BAD_INPUT", "The action requires a parameter not exposed by this restricted bridge.")
        args = [channel_name, request["op"]]
        for param in action["params"]:
            if not isinstance(param, dict) or param.get("required") or param.get("name") not in supplied:
                continue
            if param["name"] == "limit" and param.get("type") != "int":
                raise BridgeError("CLI_INVALID_OUTPUT", "Agent Reach declared an incompatible limit parameter.")
            args.extend(["--" + param["name"], str(supplied[param["name"]])])
        args.extend(["--timeout", "60", "--"])
        args.extend(str(supplied[p["name"]]) for p in required)
        return sanitize_result(self._run(args, 75), request)


def handle(value: object, cli: AgentReachCLI | None = None) -> dict:
    request = normalize_request(value)
    client = cli or AgentReachCLI()
    if request["op"] == "status":
        return client.status()
    return client.execute(request)


def read_message(stream) -> dict | None:
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise BridgeError("BAD_MESSAGE", "Truncated native-messaging header.")
    length = struct.unpack("<I", header)[0]
    if length < 2 or length > MAX_MESSAGE_BYTES:
        raise BridgeError("MESSAGE_LIMIT", "Native message exceeds the 64 KB limit.")
    data = stream.read(length)
    if len(data) != length:
        raise BridgeError("BAD_MESSAGE", "Truncated native-messaging body.")
    try:
        value = json.loads(data.decode("utf-8"))
    except (UnicodeError, ValueError) as exc:
        raise BridgeError("BAD_MESSAGE", "Native message must be valid UTF-8 JSON.") from exc
    if not isinstance(value, dict):
        raise BridgeError("BAD_MESSAGE", "Native message must be a JSON object.")
    return value


def write_message(stream, value: dict) -> None:
    data = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(data) > 1024 * 1024:
        raise BridgeError("MESSAGE_LIMIT", "Sanitized native response exceeds 1 MB.")
    stream.write(struct.pack("<I", len(data)))
    stream.write(data)
    stream.flush()


def main() -> int:
    try:
        request = read_message(sys.stdin.buffer)
        if request is None:
            return 0
        response = handle(request)
    except BridgeError as exc:
        response = {"bridge_error": True, "ok": False, "error": {"code": exc.code, "message": exc.message, "hint": exc.hint}}
    except Exception as exc:  # Do not serialize stack traces, paths, or upstream output.
        print("Orbit Reach bridge internal error: " + type(exc).__name__, file=sys.stderr)
        response = {"bridge_error": True, "ok": False, "error": {"code": "INTERNAL_ERROR", "message": "The local Reach bridge failed safely.", "hint": "Check the local installation; no command was forwarded by this error handler."}}
    write_message(sys.stdout.buffer, response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
