#!/usr/bin/env python3
"""One-time, per-user Orbit Reach native-host installer. No administrator rights."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys

from orbit_reach_host import HOST_NAME, BridgeError, find_cli, validate_cli_path


def extension_id(value: str) -> str:
    if not re.fullmatch(r"[a-p]{32}", value):
        raise argparse.ArgumentTypeError("Use the 32-character Chrome extension ID shown in Orbit Settings → Reach.")
    return value


def paths(browser: str) -> tuple[Path, Path]:
    if os.name == "nt":
        root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return root / "Orbit" / "ReachBridge", root / "Orbit" / "ReachBridge" / f"{HOST_NAME}.json"
    install = Path.home() / ".local" / "share" / "orbit-reach-bridge"
    if sys.platform == "darwin":
        folder = "Google/Chrome" if browser == "chrome" else "Microsoft Edge"
        manifest_dir = Path.home() / "Library" / "Application Support" / folder / "NativeMessagingHosts"
    else:
        folder = "google-chrome" if browser == "chrome" else "microsoft-edge"
        manifest_dir = Path.home() / ".config" / folder / "NativeMessagingHosts"
    return install, manifest_dir / f"{HOST_NAME}.json"


def build_manifest(extension: str, launcher: Path) -> dict:
    return {"name": HOST_NAME, "description": "Restricted Agent Reach search/read bridge for one Orbit extension", "path": str(launcher.resolve()), "type": "stdio", "allowed_origins": [f"chrome-extension://{extension}/"]}


def register_windows(browser: str, manifest: Path) -> None:
    import winreg
    product = "Google\\Chrome" if browser == "chrome" else "Microsoft\\Edge"
    key_path = f"Software\\{product}\\NativeMessagingHosts\\{HOST_NAME}"
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extension-id", required=True, type=extension_id)
    parser.add_argument("--browser", choices=("chrome", "edge"), default="chrome")
    parser.add_argument("--cli", help="Absolute or user-relative path to the agent-reach executable installed by uv.")
    args = parser.parse_args()
    try:
        cli = validate_cli_path(args.cli) if args.cli else find_cli()
    except BridgeError as exc:
        parser.exit(2, f"Agent Reach CLI unavailable: {exc.message}\n{exc.hint}\nInstall with:\n  uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip\n  agent-reach setup\nThen rerun this installer, using --cli if the executable is not on PATH.\n")
    install_dir, manifest_path = paths(args.browser)
    install_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    source = Path(__file__).resolve().with_name("orbit_reach_host.py")
    host = install_dir / "orbit_reach_host.py"
    if source != host:
        shutil.copy2(source, host)
    (install_dir / "bridge-config.json").write_text(json.dumps({"cli_path": str(cli)}, indent=2) + "\n", encoding="utf-8")
    if os.name == "nt":
        launcher = install_dir / "orbit-reach-host.cmd"
        command = subprocess.list2cmdline([sys.executable, str(host)])
        try:
            launcher.write_text("@echo off\r\n" + command + "\r\n", encoding="ascii")
        except UnicodeEncodeError:
            parser.exit(2, "Your Python path contains characters this launcher cannot encode.\n"
                           "Reinstall Python at an ASCII-only path (for example the default per-user path), then rerun this installer.\n")
    else:
        launcher = install_dir / "orbit-reach-host.sh"
        launcher.write_text("#!/bin/sh\nexec " + shlex.quote(sys.executable) + " " + shlex.quote(str(host)) + "\n", encoding="utf-8")
        launcher.chmod(0o700)
    manifest = build_manifest(args.extension_id, launcher)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if os.name == "nt":
        register_windows(args.browser, manifest_path)
    print("Orbit Reach bridge installed for the current user.")
    print("Allowed extension: " + args.extension_id)
    print("Agent Reach CLI: " + str(cli))
    print("Host manifest: " + str(manifest_path))
    print("Restart Chrome/Edge completely, reload Orbit, then open Settings → Reach → Refresh status.")
    print("Credentials remain in Agent Reach; this configuration stores only cli_path.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
