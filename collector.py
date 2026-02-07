#!/usr/bin/env python3
"""
Enhanced Dashboard Data Collector for Pinchy.
Reads OpenClaw session data, agent health metrics, calendar, and learning entries.
Outputs dashboard-friendly JSON to the data/ directory.

Run via cron or the loop script to keep data fresh:
    python3 collector.py              # one-shot
    bash dashboard-loop.sh            # every 5 minutes
"""

import json
import os
import subprocess
import re
from datetime import datetime, timedelta
from pathlib import Path

try:
    import requests as http_requests
except ImportError:
    http_requests = None

import ics_reader
import memory_reader
import workspace_reader

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_FILE = DATA_DIR / "data.json"
HISTORY_FILE = DATA_DIR / "history.json"
LEARNING_FILE = DATA_DIR / "learning.json"

# OpenClaw session directory — adjust if your install is different
SESSIONS_DIR = Path(os.environ.get(
    "OPENCLAW_SESSIONS",
    "/root/.openclaw/agents/main/sessions"
))

DATA_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Shell helper
# ---------------------------------------------------------------------------

def run_command(cmd, timeout=30):
    """Run a shell command and return stdout, or empty string on failure."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout
        )
        return result.stdout.strip()
    except Exception as e:
        print(f"  [warn] Command failed: {e}")
        return ""


# ---------------------------------------------------------------------------
# Config helper
# ---------------------------------------------------------------------------

def _load_config():
    """Load dashboard config for Gateway URL/token."""
    config_path = DATA_DIR / "config.json"
    if config_path.exists():
        try:
            with open(config_path) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


# ---------------------------------------------------------------------------
# Calendar  (reads .ics files from mounted volume)
# ---------------------------------------------------------------------------

def get_calendar_events():
    """Get upcoming calendar events from mounted ICS files, with Gateway chat fallback."""
    cfg = _load_config()
    configured_path = cfg.get("calendar_path", "/calendars")
    enabled = cfg.get("enabled_calendars", [])
    cal_ids = enabled if enabled else None

    # 1. Try configured path + known vdirsyncer fallback locations (ICS files)
    resolved_path, source = ics_reader.find_calendar_path(configured_path)
    if resolved_path:
        events = ics_reader.read_calendar_events(resolved_path, calendar_ids=cal_ids, days_ahead=7)
        if events:
            print(f"  Calendar: {len(events)} events from ICS files ({source}: {resolved_path})")
            return events[:15]

    # 2. Fallback: ask the OpenClaw agent via Gateway chat
    events = _calendar_via_gateway()
    if events:
        print(f"  Calendar: {len(events)} events from Gateway agent")
        return events[:15]

    print("  Calendar: no events found (no ICS mount and Gateway fallback failed)")
    return []


def _calendar_via_gateway(days=7):
    """Ask the OpenClaw agent to list calendar events via chat completions."""
    if http_requests is None:
        print("  [calendar-gw] requests library not available")
        return []

    cfg = _load_config()
    gateway_url = os.environ.get("OPENCLAW_GATEWAY_URL", "") or cfg.get("gateway_url", "")
    gateway_token = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "") or cfg.get("gateway_token", "")

    if not gateway_url or not gateway_token:
        print("  [calendar-gw] no gateway_url or gateway_token configured")
        return []

    try:
        url = f"{gateway_url.rstrip('/')}/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {gateway_token}",
        }

        prompt = (
            f"Run this exact command and return ONLY its raw output with no explanation, "
            f"no markdown formatting, no code fences:\n"
            f"khal list today {days}d --format '{{start-date}} {{start-time}} {{end-time}} {{title}}'"
        )

        resp = http_requests.post(
            url,
            json={
                "model": "openclaw:main",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 2000,
            },
            headers=headers,
            timeout=30,
        )

        if resp.status_code != 200:
            print(f"  [calendar-gw] Gateway returned HTTP {resp.status_code}")
            return []

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content:
            print("  [calendar-gw] Gateway returned empty content")
            return []

        print(f"  [calendar-gw] Raw response ({len(content)} chars): {content[:200]}")

        # Parse the khal output lines
        events = _parse_khal_output(content)
        print(f"  [calendar-gw] Parsed {len(events)} events")
        return events[:50]
    except Exception as e:
        print(f"  [calendar-gw] Error: {e}")
        return []


def _strip_code_fences(text):
    """Remove markdown code fences from text, keeping only the content inside."""
    text = re.sub(r'```[\w]*\n?', '', text)
    return text.strip()


def _parse_khal_output(content):
    """Parse khal list output into event dicts. Handles multiple date formats
    including DD/MM/YYYY, YYYY-MM-DD, DD.MM.YYYY etc."""
    # Strip markdown code fences that the agent might wrap around output
    content = _strip_code_fences(content)
    events = []
    current_date = None

    # Generic date pattern: matches YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY
    DATE_RE = r'(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4})'

    for line in content.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        # Date headers: "Today, 07/02/2026" or "Saturday, 08.02.2026"
        date_header = re.match(r'^(?:Today|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(.+)', line, re.IGNORECASE)
        if date_header:
            parsed = _try_parse_date(date_header.group(1).strip())
            if parsed:
                current_date = parsed
            continue

        # Format: DATE HH:MM HH:MM Title (with start and end time)
        m = re.match(DATE_RE + r'\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(.+)', line)
        if m:
            parsed = _try_parse_date(m.group(1))
            if parsed:
                events.append({
                    "date": parsed, "time": m.group(2), "end": m.group(3),
                    "title": m.group(4).strip(), "location": "", "calendar": "khal", "all_day": False,
                })
                continue

        # Format: DATE HH:MM Title (no end time)
        m2 = re.match(DATE_RE + r'\s+(\d{2}:\d{2})\s+(.+)', line)
        if m2:
            parsed = _try_parse_date(m2.group(1))
            if parsed:
                events.append({
                    "date": parsed, "time": m2.group(2), "end": "",
                    "title": m2.group(3).strip(), "location": "", "calendar": "khal", "all_day": False,
                })
                continue

        # Format: DATE Title (all day)
        m3 = re.match(DATE_RE + r'\s+(.+)', line)
        if m3:
            parsed = _try_parse_date(m3.group(1))
            if parsed:
                events.append({
                    "date": parsed, "time": "All day", "end": "",
                    "title": m3.group(2).strip(), "location": "", "calendar": "khal", "all_day": True,
                })
                continue

        # Time-only line under a date header: "HH:MM-HH:MM Title" or "HH:MM HH:MM Title"
        if current_date:
            m4 = re.match(r"(\d{2}:\d{2})[-\s]+(\d{2}:\d{2})\s+(.+)", line)
            if m4:
                events.append({
                    "date": current_date, "time": m4.group(1), "end": m4.group(2),
                    "title": m4.group(3).strip(), "location": "", "calendar": "khal", "all_day": False,
                })
                continue
            # All day event under date header
            if not re.match(r'\d', line):
                events.append({
                    "date": current_date, "time": "All day", "end": "",
                    "title": line, "location": "", "calendar": "khal", "all_day": True,
                })

    return events


def _try_parse_date(s):
    """Try to parse a date string into YYYY-MM-DD format."""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Learning entries
# ---------------------------------------------------------------------------

def get_learning_entries():
    """Read the last 20 entries from learning.json."""
    if LEARNING_FILE.exists():
        try:
            with open(LEARNING_FILE) as f:
                data = json.load(f)
                return data.get("entries", [])[-20:]
        except Exception:
            pass
    return []


# ---------------------------------------------------------------------------
# Session stats
# ---------------------------------------------------------------------------

def get_session_stats():
    """Parse OpenClaw session .jsonl files for token/cost estimates."""
    sessions = []
    total_tokens = 0
    today_tokens = 0
    today = datetime.now().strftime("%Y-%m-%d")

    if SESSIONS_DIR.exists():
        for session_file in SESSIONS_DIR.glob("*.jsonl"):
            try:
                stat = session_file.stat()
                mtime = datetime.fromtimestamp(stat.st_mtime)
                # Rough token estimate: ~4 chars per token
                est_tokens = int(stat.st_size / 4)
                total_tokens += est_tokens

                if mtime.strftime("%Y-%m-%d") == today:
                    today_tokens += est_tokens

                sessions.append({
                    "key": session_file.stem,
                    "name": session_file.stem[:20],
                    "tokens": est_tokens,
                    "cost": est_tokens * 0.000015,  # Opus pricing estimate
                    "updated": mtime.isoformat()
                })
            except Exception:
                continue

    sessions.sort(key=lambda x: x.get("updated", ""), reverse=True)

    return {
        "sessions": sessions[:10],
        "sessionCount": len(sessions),
        "totalTokens": total_tokens,
        "todayTokens": today_tokens,
    }


# ---------------------------------------------------------------------------
# Agent health / status
# ---------------------------------------------------------------------------

def _check_gateway_health():
    """
    Check if the OpenClaw agent is reachable by pinging the Gateway.
    Returns True if the Gateway responds, False otherwise.
    Used in standalone container mode where pgrep can't see the OpenClaw process.
    """
    if http_requests is None:
        print("  [gateway-health] requests library not available")
        return False

    cfg = _load_config()
    gateway_url = os.environ.get("OPENCLAW_GATEWAY_URL", "") or cfg.get("gateway_url", "")
    gateway_token = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "") or cfg.get("gateway_token", "")

    if not gateway_url:
        print("  [gateway-health] no gateway_url configured")
        return False

    headers = {}
    if gateway_token:
        headers["Authorization"] = f"Bearer {gateway_token}"

    # Method A: simple GET — any HTTP response means Gateway is alive
    for path in ("/v1/models", "/v1/chat/completions", "/"):
        try:
            resp = http_requests.get(
                f"{gateway_url.rstrip('/')}{path}",
                headers=headers,
                timeout=5,
            )
            # Any response (even 404/405) means the Gateway is running
            if resp.status_code < 500:
                print(f"  [gateway-health] {path} responded {resp.status_code} — alive")
                return True
            print(f"  [gateway-health] {path} returned {resp.status_code}")
        except Exception as e:
            print(f"  [gateway-health] {path} error: {e}")

    return False


def get_agent_status():
    """
    Gather agent health metrics:
      - running: is the openclaw process alive?
      - uptimeMs: how long has it been running?
      - memoryMB: resident set size
      - cpuPercent: CPU usage
      - recentErrors: count of ERROR lines in recent logs
      - lastActivity: timestamp of most recent session modification

    In standalone container mode (pgrep can't see OpenClaw), falls back to
    checking Gateway reachability and recent session file activity.
    """
    status = {
        "running": False,
        "uptimeMs": None,
        "memoryMB": None,
        "cpuPercent": None,
        "recentErrors": 0,
        "lastActivity": None,
    }

    # Method 0: Check HEARTBEAT.md modification time (most reliable for standalone)
    heartbeat = workspace_reader.read_heartbeat()
    if heartbeat.get("alive"):
        status["running"] = True
        status["lastBeat"] = heartbeat.get("last_beat", "")
        print("  Agent status: alive via HEARTBEAT.md")
    else:
        # Method 1: Check if openclaw process is running locally (same-container mode)
        pid_out = run_command("pgrep -f 'openclaw' | head -1")
        if pid_out:
            status["running"] = True

            # Uptime in seconds
            uptime_out = run_command(f"ps -o etimes= -p {pid_out} 2>/dev/null")
            if uptime_out:
                try:
                    status["uptimeMs"] = int(uptime_out.strip()) * 1000
                except ValueError:
                    pass

            # Memory (RSS in KB -> MB)
            mem_out = run_command(f"ps -o rss= -p {pid_out} 2>/dev/null")
            if mem_out:
                try:
                    status["memoryMB"] = round(int(mem_out.strip()) / 1024, 1)
                except ValueError:
                    pass

            # CPU %
            cpu_out = run_command(f"ps -o %cpu= -p {pid_out} 2>/dev/null")
            if cpu_out:
                try:
                    status["cpuPercent"] = round(float(cpu_out.strip()), 1)
                except ValueError:
                    pass
        else:
            # Method 2: Standalone mode — check if Gateway is reachable
            if _check_gateway_health():
                status["running"] = True
                print("  Agent status: detected via Gateway")

    # Count recent errors from openclaw logs (last 100 lines)
    log_paths = [
        "/root/.openclaw/logs/openclaw.log",
        "/root/.openclaw/agents/main/agent.log",
    ]
    for log_path in log_paths:
        if Path(log_path).exists():
            error_out = run_command(f"tail -100 {log_path} | grep -ci 'error' 2>/dev/null")
            if error_out:
                try:
                    status["recentErrors"] += int(error_out)
                except ValueError:
                    pass

    # Last activity: most recent session file modification
    if SESSIONS_DIR.exists():
        latest = None
        for f in SESSIONS_DIR.glob("*.jsonl"):
            try:
                mt = f.stat().st_mtime
                if latest is None or mt > latest:
                    latest = mt
            except Exception:
                pass
        if latest:
            status["lastActivity"] = datetime.fromtimestamp(latest).isoformat()

    return status


# ---------------------------------------------------------------------------
# Cost history
# ---------------------------------------------------------------------------

def load_history():
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {"daily": {}}


def save_history(history):
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Collecting dashboard data...")

    # Session stats
    stats = get_session_stats()

    # Cost history
    history = load_history()
    today_str = datetime.now().strftime("%Y-%m-%d")
    yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    today_cost = stats["todayTokens"] * 0.000015
    history["daily"][today_str] = today_cost

    # Prune > 30 days
    cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    history["daily"] = {k: v for k, v in history["daily"].items() if k >= cutoff}
    save_history(history)

    # 7-day chart data
    chart_data = []
    for i in range(6, -1, -1):
        d = datetime.now() - timedelta(days=i)
        day_label = d.strftime("%a")
        cost = history["daily"].get(d.strftime("%Y-%m-%d"), 0)
        chart_data.append({"day": day_label, "cost": cost})

    cost_change = today_cost - history["daily"].get(yesterday_str, 0)

    # Agent status
    agent_status = get_agent_status()

    # Calendar & learning
    calendar_events = get_calendar_events()
    learning_entries = get_learning_entries()

    # Assemble output
    data = {
        "todayCost": today_cost,
        "costChange": cost_change,
        "totalTokens": stats["totalTokens"],
        "todayTokens": stats["todayTokens"],
        "sessionCount": stats["sessionCount"],
        "sessions": stats["sessions"],
        "history": chart_data,
        "uptimeMs": agent_status.get("uptimeMs"),
        "agentStatus": agent_status,
        "calendar": calendar_events,
        "learning": learning_entries,
        "generatedAt": datetime.now().isoformat(),
    }

    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

    print(f"  Data written to {DATA_FILE}")
    print(f"  Today's cost:  ${today_cost:.4f}")
    print(f"  Total tokens:  {stats['totalTokens']:,}")
    print(f"  Sessions:      {stats['sessionCount']}")
    print(f"  Agent running: {agent_status['running']}")
    if agent_status.get("memoryMB"):
        print(f"  Agent memory:  {agent_status['memoryMB']} MB")
    if agent_status.get("recentErrors"):
        print(f"  Recent errors: {agent_status['recentErrors']}")


if __name__ == "__main__":
    main()
