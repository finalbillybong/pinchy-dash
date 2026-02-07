#!/usr/bin/env python3
"""
Pinchy Dashboard - Flask Backend
Serves the dashboard frontend and provides REST API endpoints for
goals, content, learning entries, and collected data.
"""

import json
import os
import uuid
from datetime import datetime
from functools import wraps
from pathlib import Path

import requests as http_requests
from flask import Flask, Response, jsonify, request, send_from_directory, abort, stream_with_context

import ics_reader
import memory_reader
import workspace_reader

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"

DATA_DIR.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=str(STATIC_DIR))

# Optional API key – set DASHBOARD_API_KEY env var to protect write endpoints
API_KEY = os.environ.get("DASHBOARD_API_KEY", "")

# OpenClaw Gateway settings for the Chat feature
# Env vars take priority; if not set, falls back to stored config in data/config.json
_ENV_GATEWAY_URL = os.environ.get("OPENCLAW_GATEWAY_URL", "")
_ENV_GATEWAY_TOKEN = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "")


def _get_config():
    """Return merged config: env vars override stored values."""
    stored = _read_json("config.json", {})
    return {
        "gateway_url": _ENV_GATEWAY_URL or stored.get("gateway_url", ""),
        "gateway_token": _ENV_GATEWAY_TOKEN or stored.get("gateway_token", ""),
        "calendar_path": stored.get("calendar_path", "/calendars"),
        "enabled_calendars": stored.get("enabled_calendars", []),
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json_path(name: str) -> Path:
    return DATA_DIR / name


def _read_json(name: str, default=None):
    path = _json_path(name)
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return default if default is not None else {}


def _write_json(name: str, data):
    path = _json_path(name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def require_api_key(f):
    """Decorator: require Bearer token on write endpoints when API_KEY is set."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if API_KEY:
            auth = request.headers.get("Authorization", "")
            if auth != f"Bearer {API_KEY}":
                return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# Static / SPA serving  (index route — catch-all is at the bottom of the file)
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(str(STATIC_DIR), "index.html")


# ---------------------------------------------------------------------------
# API: Health
# ---------------------------------------------------------------------------

@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


# ---------------------------------------------------------------------------
# API: Dashboard data (read-only, written by collector)
# ---------------------------------------------------------------------------

@app.route("/api/data")
def get_data():
    return jsonify(_read_json("data.json", {}))


@app.route("/api/collect", methods=["POST"])
def trigger_collect():
    """Trigger an immediate collector run (non-blocking)."""
    import subprocess, sys
    try:
        subprocess.Popen(
            [sys.executable, str(Path(__file__).parent / "collector.py")],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return jsonify({"triggered": True})
    except Exception as e:
        return jsonify({"triggered": False, "error": str(e)}), 500


@app.route("/api/history")
def get_history():
    return jsonify(_read_json("history.json", {"daily": {}}))


# ---------------------------------------------------------------------------
# API: Learning  (CRUD)
# ---------------------------------------------------------------------------

@app.route("/api/learning")
def get_learning():
    data = _read_json("learning.json", {"entries": []})
    return jsonify(data)


@app.route("/api/learning", methods=["POST"])
@require_api_key
def add_learning():
    body = request.get_json(force=True)
    data = _read_json("learning.json", {"entries": []})
    entries = data.get("entries", [])

    entry = {
        "id": str(uuid.uuid4())[:8],
        "type": body.get("type", "observation"),
        "title": body.get("title", ""),
        "detail": body.get("detail", ""),
        "outcome": body.get("outcome", ""),
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    entries.append(entry)
    entries = entries[-100:]  # keep last 100
    _write_json("learning.json", {"entries": entries})
    return jsonify(entry), 201


@app.route("/api/learning/<entry_id>", methods=["DELETE"])
@require_api_key
def delete_learning(entry_id):
    data = _read_json("learning.json", {"entries": []})
    entries = data.get("entries", [])
    data["entries"] = [e for e in entries if str(e.get("id")) != str(entry_id)]
    _write_json("learning.json", data)
    return jsonify({"deleted": entry_id})


# ---------------------------------------------------------------------------
# API: Goals  (CRUD)
# ---------------------------------------------------------------------------

@app.route("/api/goals")
def get_goals():
    data = _read_json("goals.json", {"goals": []})
    return jsonify(data)


@app.route("/api/goals", methods=["POST"])
@require_api_key
def add_goal():
    body = request.get_json(force=True)
    data = _read_json("goals.json", {"goals": []})
    goals = data.get("goals", [])

    goal = {
        "id": str(uuid.uuid4())[:8],
        "title": body.get("title", ""),
        "description": body.get("description", ""),
        "milestones": body.get("milestones", []),
        "progress": body.get("progress", 0),
        "status": body.get("status", "active"),
        "deadline": body.get("deadline", ""),
        "created": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    goals.append(goal)
    data["goals"] = goals
    _write_json("goals.json", data)
    return jsonify(goal), 201


@app.route("/api/goals/<goal_id>", methods=["PUT"])
@require_api_key
def update_goal(goal_id):
    body = request.get_json(force=True)
    data = _read_json("goals.json", {"goals": []})
    goals = data.get("goals", [])

    for goal in goals:
        if goal.get("id") == goal_id:
            for key in ("title", "description", "milestones", "progress", "status", "deadline"):
                if key in body:
                    goal[key] = body[key]
            goal["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            data["goals"] = goals
            _write_json("goals.json", data)
            return jsonify(goal)

    return jsonify({"error": "Not found"}), 404


@app.route("/api/goals/<goal_id>", methods=["DELETE"])
@require_api_key
def delete_goal(goal_id):
    data = _read_json("goals.json", {"goals": []})
    data["goals"] = [g for g in data.get("goals", []) if g.get("id") != goal_id]
    _write_json("goals.json", data)
    return jsonify({"deleted": goal_id})


# ---------------------------------------------------------------------------
# API: Content  (CRUD)
# ---------------------------------------------------------------------------

@app.route("/api/content")
def get_content():
    data = _read_json("content.json", {"items": []})
    return jsonify(data)


@app.route("/api/content", methods=["POST"])
@require_api_key
def add_content():
    body = request.get_json(force=True)
    data = _read_json("content.json", {"items": []})
    items = data.get("items", [])

    item = {
        "id": str(uuid.uuid4())[:8],
        "title": body.get("title", ""),
        "type": body.get("type", "idea"),
        "tags": body.get("tags", []),
        "notes": body.get("notes", ""),
        "status": body.get("status", "idea"),
        "created": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    items.append(item)
    data["items"] = items
    _write_json("content.json", data)
    return jsonify(item), 201


@app.route("/api/content/<item_id>", methods=["PUT"])
@require_api_key
def update_content(item_id):
    body = request.get_json(force=True)
    data = _read_json("content.json", {"items": []})
    items = data.get("items", [])

    for item in items:
        if item.get("id") == item_id:
            for key in ("title", "type", "tags", "notes", "status"):
                if key in body:
                    item[key] = body[key]
            item["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            data["items"] = items
            _write_json("content.json", data)
            return jsonify(item)

    return jsonify({"error": "Not found"}), 404


@app.route("/api/content/<item_id>", methods=["DELETE"])
@require_api_key
def delete_content(item_id):
    data = _read_json("content.json", {"items": []})
    data["items"] = [i for i in data.get("items", []) if i.get("id") != item_id]
    _write_json("content.json", data)
    return jsonify({"deleted": item_id})


# ---------------------------------------------------------------------------
# API: Chat  (streaming proxy to OpenClaw Gateway)
# ---------------------------------------------------------------------------

@app.route("/api/chat", methods=["POST"])
@require_api_key
def chat_proxy():
    """
    Proxy chat requests to the OpenClaw Gateway's OpenAI-compatible
    Chat Completions endpoint.  Streams SSE back to the browser.

    Expects: { "message": "...", "history": [ {role, content}, ... ] }
    """
    cfg = _get_config()
    if not cfg["gateway_url"]:
        return jsonify({"error": "Gateway URL not configured. Go to Settings to set it up."}), 503

    body = request.get_json(force=True)
    user_msg = body.get("message", "").strip()
    if not user_msg:
        return jsonify({"error": "Empty message"}), 400

    # Build OpenAI-format messages list from history + new message
    history = body.get("history", [])
    messages = []
    for h in history[-20:]:  # keep last 20 turns for context
        messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
    messages.append({"role": "user", "content": user_msg})

    # Build the request to OpenClaw Gateway
    gateway_url = f"{cfg['gateway_url'].rstrip('/')}/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    if cfg["gateway_token"]:
        headers["Authorization"] = f"Bearer {cfg['gateway_token']}"

    # Use stored default model
    stored = _read_json("config.json", {})
    model = stored.get("default_model") or "openclaw:main"

    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
    }

    def generate():
        try:
            with http_requests.post(
                gateway_url,
                json=payload,
                headers=headers,
                stream=True,
                timeout=120,
            ) as resp:
                if resp.status_code != 200:
                    if resp.status_code in (404, 405):
                        msg = (
                            "Chat Completions HTTP endpoint is not enabled on your Gateway. "
                            "Add this to your OpenClaw config and restart the Gateway: "
                            '{ "gateway": { "http": { "endpoints": { "chatCompletions": { "enabled": true } } } } }'
                        )
                    else:
                        error_body = resp.text[:500]
                        msg = f"Gateway returned {resp.status_code}: {error_body}"
                    yield f"data: {json.dumps({'error': msg})}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                for line in resp.iter_lines(decode_unicode=True):
                    if line:
                        # Forward SSE lines as-is
                        yield f"{line}\n\n"
        except http_requests.exceptions.ConnectionError:
            yield f"data: {json.dumps({'error': 'Cannot connect to OpenClaw Gateway at ' + cfg['gateway_url']})}\n\n"
            yield "data: [DONE]\n\n"
        except http_requests.exceptions.Timeout:
            yield f"data: {json.dumps({'error': 'Gateway request timed out'})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# API: Chat History  (server-side persistence)
# ---------------------------------------------------------------------------

@app.route("/api/chat/history")
def get_chat_history():
    """Return stored chat messages."""
    data = _read_json("chat_history.json", {"messages": []})
    return jsonify(data)


@app.route("/api/chat/history", methods=["POST"])
@require_api_key
def save_chat_history():
    """Save chat messages (replaces full history)."""
    body = request.get_json(force=True)
    messages = body.get("messages", [])
    if not isinstance(messages, list):
        return jsonify({"error": "messages must be an array"}), 400
    # Cap at 200 messages
    messages = messages[-200:]
    _write_json("chat_history.json", {"messages": messages})
    return jsonify({"saved": True, "count": len(messages)})


@app.route("/api/chat/history", methods=["DELETE"])
@require_api_key
def clear_chat_history():
    """Clear all chat messages."""
    _write_json("chat_history.json", {"messages": []})
    return jsonify({"cleared": True})


@app.route("/api/chat/status")
def chat_status():
    """Check if the chat feature is configured."""
    cfg = _get_config()
    has_url = bool(cfg["gateway_url"])
    has_token = bool(cfg["gateway_token"])
    return jsonify({
        "configured": has_url,
        "gateway_url": cfg["gateway_url"] if has_url else None,
        "has_token": has_token,
    })


# ---------------------------------------------------------------------------
# API: Calendar  (direct ICS file reading from mounted volume)
# ---------------------------------------------------------------------------

@app.route("/api/calendars/discover")
def discover_calendars():
    """Scan the calendar mount path (with fallback chain) and return discovered calendars.
    Falls back to asking the OpenClaw agent via Gateway if no ICS files are found."""
    cfg = _get_config()
    configured_path = cfg.get("calendar_path", "/calendars")

    # 1. Try the configured path first, then known vdirsyncer locations
    resolved_path, source = ics_reader.find_calendar_path(configured_path)

    if resolved_path:
        calendars = ics_reader.discover_calendars(resolved_path)
        # If auto-detected a different path, save it for future use
        if source == "auto-detected" and resolved_path != configured_path:
            stored = _read_json("config.json", {})
            stored["calendar_path"] = resolved_path
            _write_json("config.json", stored)
        return jsonify({
            "calendars": calendars,
            "calendar_path": resolved_path,
            "source": source,
            "found": len(calendars) > 0,
        })

    # 2. Fallback: ask the OpenClaw agent to list calendars via Gateway chat
    gw_calendars = _discover_calendars_via_gateway(cfg)
    if gw_calendars:
        return jsonify({
            "calendars": gw_calendars,
            "calendar_path": "gateway",
            "source": "gateway",
            "found": True,
        })

    return jsonify({
        "calendars": [],
        "calendar_path": configured_path,
        "source": "none",
        "found": False,
    })


@app.route("/api/calendars/events")
def get_calendar_events():
    """Read upcoming events from enabled calendars (ICS files, with Gateway chat fallback)."""
    cfg = _get_config()
    configured_path = cfg.get("calendar_path", "/calendars")
    enabled = cfg.get("enabled_calendars", [])
    days = request.args.get("days", 7, type=int)
    days = min(days, 90)  # cap at 90 days

    print(f"  [cal-events] configured_path={configured_path!r}, enabled={enabled!r}, days={days}")

    # 1. Try ICS files (configured path + fallback paths)
    resolved_path, _source = ics_reader.find_calendar_path(configured_path)
    if resolved_path:
        print(f"  [cal-events] ICS path found: {resolved_path} ({_source})")
        cal_ids = enabled if enabled else None
        events = ics_reader.read_calendar_events(resolved_path, calendar_ids=cal_ids, days_ahead=days)
        if events:
            return jsonify({"events": events, "count": len(events), "source": "ics"})
        print(f"  [cal-events] ICS path exists but returned 0 events, trying Gateway")
    else:
        print(f"  [cal-events] No ICS path found, trying Gateway")

    # 2. Fallback: ask the Gateway's agent to run khal list
    events = _calendar_via_gateway(cfg, days)
    return jsonify({"events": events, "count": len(events), "source": "gateway" if events else "none"})


@app.route("/api/calendars/debug")
def calendar_debug():
    """Debug endpoint: returns raw Gateway response for calendar query."""
    cfg = _get_config()
    configured_path = cfg.get("calendar_path", "/calendars")
    enabled = cfg.get("enabled_calendars", [])
    resolved_path, _source = ics_reader.find_calendar_path(configured_path)

    debug = {
        "configured_path": configured_path,
        "enabled_calendars": enabled,
        "ics_resolved_path": resolved_path,
        "ics_source": _source,
        "gateway_url": cfg.get("gateway_url", ""),
        "has_token": bool(cfg.get("gateway_token")),
    }

    # Try Gateway and capture raw response
    if cfg.get("gateway_url") and cfg.get("gateway_token"):
        try:
            gateway_url = f"{cfg['gateway_url'].rstrip('/')}/v1/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {cfg['gateway_token']}",
            }
            prompt = (
                "Run this exact command and return ONLY its raw output with no explanation, "
                "no markdown formatting, no code fences:\n"
                "khal list today 7d --format '{start-date} {start-time} {end-time} {title}'"
            )
            resp = http_requests.post(
                gateway_url,
                json={
                    "model": "openclaw:main",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 2000,
                },
                headers=headers,
                timeout=30,
            )
            debug["gateway_status"] = resp.status_code
            if resp.status_code == 200:
                data = resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                debug["gateway_raw_content"] = content
                debug["gateway_parsed_events"] = _parse_khal_output(content)
            else:
                debug["gateway_error"] = resp.text[:500]
        except Exception as e:
            debug["gateway_error"] = str(e)
    else:
        debug["gateway_error"] = "No gateway_url or gateway_token configured"

    return jsonify(debug)


def _calendar_via_gateway(cfg, days=7):
    """Ask the OpenClaw agent to list calendar events via chat completions."""
    if not cfg.get("gateway_url") or not cfg.get("gateway_token"):
        print("  [calendar-gw] no gateway_url or gateway_token configured")
        return []

    try:
        gateway_url = f"{cfg['gateway_url'].rstrip('/')}/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['gateway_token']}",
        }

        prompt = (
            f"Run this exact command and return ONLY its raw output with no explanation, "
            f"no markdown formatting, no code fences:\n"
            f"khal list today {days}d --format '{{start-date}} {{start-time}} {{end-time}} {{title}}'"
        )

        resp = http_requests.post(
            gateway_url,
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
    import re
    # Remove ```...``` blocks, keeping the content between them
    text = re.sub(r'```[\w]*\n?', '', text)
    return text.strip()


def _parse_khal_output(content):
    """Parse khal list output into event dicts. Handles multiple date formats
    including DD/MM/YYYY, YYYY-MM-DD, DD.MM.YYYY etc."""
    import re
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
    from datetime import datetime as _dt
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return _dt.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _discover_calendars_via_gateway(cfg):
    """Ask the OpenClaw agent to list available calendars via chat completions.
    Returns a list of calendar dicts compatible with the discover response."""
    if not cfg.get("gateway_url") or not cfg.get("gateway_token"):
        return []

    try:
        import re as _re
        gateway_url = f"{cfg['gateway_url'].rstrip('/')}/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['gateway_token']}",
        }
        stored = _read_json("config.json", {})
        model = stored.get("default_model") or "openclaw:main"

        prompt = (
            "Run `khal printcalendars` and return ONLY the raw output, nothing else. "
            "No explanation, no markdown formatting, just the calendar names exactly as printed."
        )

        resp = http_requests.post(
            gateway_url,
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
            },
            headers=headers,
            timeout=30,
        )

        if resp.status_code != 200:
            return []

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content:
            return []

        # Parse khal printcalendars output — each line is a calendar name
        calendars = []
        for line in content.strip().split("\n"):
            line = line.strip()
            if not line or line.startswith("```") or line.startswith("#"):
                continue
            # Clean up any potential formatting
            name = _re.sub(r"^\s*[-*]\s*", "", line).strip()
            if name:
                cal_id = name.lower().replace(" ", "_").replace("/", "_")
                calendars.append({
                    "id": cal_id,
                    "name": name,
                    "event_count": "?",
                    "color": None,
                })

        return calendars
    except Exception:
        return []


# ---------------------------------------------------------------------------
# API: Settings  (Gateway config via web UI)
# ---------------------------------------------------------------------------

@app.route("/api/settings")
def get_settings():
    """Return current settings (token is masked)."""
    cfg = _get_config()
    token = cfg.get("gateway_token", "")
    masked = ""
    if token:
        # Show first 4 and last 4 chars, mask the rest
        if len(token) > 10:
            masked = token[:4] + "*" * (len(token) - 8) + token[-4:]
        else:
            masked = token[:2] + "*" * max(0, len(token) - 2)
    stored = _read_json("config.json", {})

    # Auto-brand from IDENTITY.md on first run
    bot_name = stored.get("bot_name", "")
    if not bot_name:
        identity = workspace_reader.read_identity()
        if identity and identity.get("name"):
            bot_name = identity["name"]
            stored["bot_name"] = bot_name
            _write_json("config.json", stored)
    if not bot_name:
        bot_name = "Pinchy"

    return jsonify({
        "gateway_url": cfg.get("gateway_url", ""),
        "gateway_token_masked": masked,
        "has_token": bool(token),
        "source_url": "env" if _ENV_GATEWAY_URL else "config",
        "source_token": "env" if _ENV_GATEWAY_TOKEN else "config",
        "currency": stored.get("currency", "USD"),
        "exchange_rate": stored.get("exchange_rate", 1.0),
        "rate_updated": stored.get("rate_updated", ""),
        "onboarding_complete": stored.get("onboarding_complete", False),
        "bot_name": bot_name,
        "has_custom_icon": (DATA_DIR / "brand-icon.png").exists(),
        "calendar_path": stored.get("calendar_path", "/calendars"),
        "enabled_calendars": stored.get("enabled_calendars", []),
    })


@app.route("/api/settings", methods=["POST"])
@require_api_key
def save_settings():
    """Save gateway settings to config.json."""
    body = request.get_json(force=True)
    stored = _read_json("config.json", {})

    if "gateway_url" in body:
        url = body["gateway_url"].strip()
        # Basic validation
        if url and not url.startswith(("http://", "https://")):
            return jsonify({"error": "Gateway URL must start with http:// or https://"}), 400
        stored["gateway_url"] = url

    if "gateway_token" in body:
        stored["gateway_token"] = body["gateway_token"].strip()

    if "currency" in body:
        stored["currency"] = body["currency"].strip().upper()

    if "exchange_rate" in body:
        try:
            rate = float(body["exchange_rate"])
            if rate > 0:
                stored["exchange_rate"] = rate
        except (ValueError, TypeError):
            pass

    if "rate_updated" in body:
        stored["rate_updated"] = body["rate_updated"]

    if "custom_models" in body:
        raw = body["custom_models"]
        if isinstance(raw, list):
            stored["custom_models"] = [str(m).strip() for m in raw if str(m).strip()]

    if "onboarding_complete" in body:
        stored["onboarding_complete"] = bool(body["onboarding_complete"])

    if "bot_name" in body:
        name = str(body["bot_name"]).strip()
        if name:
            stored["bot_name"] = name[:50]  # cap at 50 chars

    if "calendar_path" in body:
        stored["calendar_path"] = str(body["calendar_path"]).strip()

    if "enabled_calendars" in body:
        raw = body["enabled_calendars"]
        if isinstance(raw, list):
            stored["enabled_calendars"] = [str(c).strip() for c in raw]

    _write_json("config.json", stored)
    return jsonify({"saved": True})


@app.route("/api/settings/test", methods=["POST"])
@require_api_key
def test_gateway_connection():
    """Test connectivity to the OpenClaw Gateway."""
    cfg = _get_config()
    if not cfg["gateway_url"]:
        return jsonify({"ok": False, "error": "No Gateway URL configured"})

    test_url = f"{cfg['gateway_url'].rstrip('/')}/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    if cfg["gateway_token"]:
        headers["Authorization"] = f"Bearer {cfg['gateway_token']}"

    try:
        # Send a minimal request; even if the agent errors, a 4xx/5xx from the
        # gateway proves connectivity + auth are working.
        resp = http_requests.post(
            test_url,
            json={
                "model": "openclaw:main",
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
            },
            headers=headers,
            timeout=10,
        )
        if resp.status_code == 200:
            return jsonify({"ok": True, "message": "Connected successfully"})
        elif resp.status_code == 401:
            return jsonify({"ok": False, "error": "Authentication failed. Check your token."})
        elif resp.status_code in (404, 405):
            return jsonify({"ok": False, "error": (
                "The Chat Completions HTTP endpoint is not enabled on your Gateway (HTTP "
                f"{resp.status_code}). Enable it in your OpenClaw config: "
                '{ "gateway": { "http": { "endpoints": { "chatCompletions": { "enabled": true } } } } } '
                "then restart the Gateway."
            )})
        else:
            return jsonify({"ok": False, "error": f"Gateway returned HTTP {resp.status_code}"})
    except http_requests.exceptions.ConnectionError:
        return jsonify({"ok": False, "error": f"Cannot connect to {cfg['gateway_url']}"})
    except http_requests.exceptions.Timeout:
        return jsonify({"ok": False, "error": "Connection timed out"})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


# ---------------------------------------------------------------------------
# API: Branding  (custom icon upload)
# ---------------------------------------------------------------------------

ALLOWED_ICON_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"}
MAX_ICON_SIZE = 512 * 1024  # 512 KB


@app.route("/api/settings/icon", methods=["POST"])
@require_api_key
def upload_icon():
    """Upload a custom brand icon (PNG/JPG/GIF/WebP/SVG, max 512 KB)."""
    if "icon" not in request.files:
        return jsonify({"error": "No file uploaded. Use form field name 'icon'."}), 400

    f = request.files["icon"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400

    if f.content_type not in ALLOWED_ICON_TYPES:
        return jsonify({"error": f"File type '{f.content_type}' not allowed. Use PNG, JPG, GIF, WebP, or SVG."}), 400

    data = f.read()
    if len(data) > MAX_ICON_SIZE:
        return jsonify({"error": f"File too large ({len(data)} bytes). Max {MAX_ICON_SIZE} bytes."}), 400

    icon_path = DATA_DIR / "brand-icon.png"
    with open(icon_path, "wb") as out:
        out.write(data)

    return jsonify({"saved": True, "size": len(data)})


@app.route("/api/settings/icon")
def get_icon():
    """Serve the custom brand icon, or 404 if none uploaded."""
    icon_path = DATA_DIR / "brand-icon.png"
    if not icon_path.exists():
        abort(404)
    return send_from_directory(str(DATA_DIR), "brand-icon.png")


@app.route("/api/settings/icon", methods=["DELETE"])
@require_api_key
def delete_icon():
    """Remove the custom brand icon (reverts to default emoji)."""
    icon_path = DATA_DIR / "brand-icon.png"
    if icon_path.exists():
        icon_path.unlink()
    return jsonify({"deleted": True})


# ---------------------------------------------------------------------------
# API: Exchange rates
# ---------------------------------------------------------------------------

@app.route("/api/settings/rates", methods=["POST"])
@require_api_key
def fetch_exchange_rates():
    """Fetch live exchange rates from a free API and save the selected rate."""
    body = request.get_json(force=True)
    currency = body.get("currency", "").strip().upper()
    if not currency:
        return jsonify({"error": "Currency code required"}), 400

    try:
        resp = http_requests.get(
            "https://open.er-api.com/v6/latest/USD",
            timeout=10,
        )
        if resp.status_code != 200:
            return jsonify({"error": f"Rate API returned HTTP {resp.status_code}"}), 502

        data = resp.json()
        rates = data.get("rates", {})
        if currency not in rates:
            return jsonify({"error": f"Currency '{currency}' not found in rate data"}), 400

        rate = rates[currency]
        now = datetime.now().isoformat()

        # Save to config
        stored = _read_json("config.json", {})
        stored["currency"] = currency
        stored["exchange_rate"] = rate
        stored["rate_updated"] = now
        _write_json("config.json", stored)

        return jsonify({
            "currency": currency,
            "exchange_rate": rate,
            "rate_updated": now,
        })
    except http_requests.exceptions.ConnectionError:
        return jsonify({"error": "Cannot reach exchange rate API. Check internet connection."}), 502
    except http_requests.exceptions.Timeout:
        return jsonify({"error": "Exchange rate API timed out"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# API: Memory  (read OpenClaw memory files from mounted volume)
# ---------------------------------------------------------------------------

_MEMORY_PATH = os.environ.get("OPENCLAW_MEMORY_PATH", "/root/.openclaw/workspace/memory")


@app.route("/api/memory")
def get_memory():
    """List memory files and recent daily summaries."""
    type_filter = request.args.get("type", "")
    files = memory_reader.discover_memory_files(_MEMORY_PATH)
    if type_filter:
        files = [f for f in files if f["type"] == type_filter]
    recent = memory_reader.get_recent_entries(_MEMORY_PATH, limit=20)
    return jsonify({"files": files, "recent": recent})


@app.route("/api/memory/<path:filename>")
def get_memory_file(filename):
    """Return the content of a single memory file."""
    result = memory_reader.read_memory_file(_MEMORY_PATH, filename)
    if result is None:
        return jsonify({"error": "File not found or access denied"}), 404
    return jsonify(result)


# ---------------------------------------------------------------------------
# API: Workspace  (IDENTITY, HEARTBEAT, TOOLS, Skills, Session Extracts)
# ---------------------------------------------------------------------------

_WORKSPACE_PATH = os.environ.get("OPENCLAW_WORKSPACE_PATH", "/root/.openclaw/workspace")


@app.route("/api/workspace/identity")
def get_identity():
    """Return parsed IDENTITY.md."""
    try:
        result = workspace_reader.read_identity(_WORKSPACE_PATH)
        if result is None:
            return jsonify({"found": False})
        return jsonify({**result, "found": True})
    except Exception as e:
        print(f"  [error] /api/workspace/identity: {e}")
        return jsonify({"found": False, "error": str(e)}), 500


@app.route("/api/workspace/identity", methods=["POST"])
@require_api_key
def save_identity():
    """Write IDENTITY.md back to the workspace."""
    body = request.get_json(silent=True) or {}
    content = body.get("content", "")
    if not content:
        return jsonify({"error": "Content is required"}), 400
    try:
        workspace_reader.write_workspace_file("IDENTITY.md", content, _WORKSPACE_PATH)
        # Re-read to update branding
        identity = workspace_reader.read_identity(_WORKSPACE_PATH)
        if identity and identity.get("name"):
            stored = _read_json("config.json", {})
            stored["bot_name"] = identity["name"]
            _write_json("config.json", stored)
        return jsonify({"saved": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/workspace/soul")
def get_soul():
    """Return soul.md content."""
    result = workspace_reader.read_soul(_WORKSPACE_PATH)
    if result is None:
        return jsonify({"found": False, "raw": ""})
    return jsonify({**result, "found": True})


@app.route("/api/workspace/soul", methods=["POST"])
@require_api_key
def save_soul():
    """Write SOUL.md back to the workspace."""
    body = request.get_json(silent=True) or {}
    content = body.get("content", "")
    if not content:
        return jsonify({"error": "Content is required"}), 400
    try:
        # Use existing filename (SOUL.md or soul.md), default to SOUL.md
        ws = Path(_WORKSPACE_PATH)
        filename = "SOUL.md"
        if (ws / "soul.md").exists() and not (ws / "SOUL.md").exists():
            filename = "soul.md"
        workspace_reader.write_workspace_file(filename, content, _WORKSPACE_PATH)
        return jsonify({"saved": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/workspace/heartbeat")
def get_heartbeat():
    """Return HEARTBEAT.md status."""
    result = workspace_reader.read_heartbeat(_WORKSPACE_PATH)
    return jsonify(result)


@app.route("/api/workspace/tools")
def get_tools():
    """Return parsed tools list from TOOLS.md."""
    tools = workspace_reader.read_tools(_WORKSPACE_PATH)
    return jsonify({"tools": tools, "count": len(tools)})


@app.route("/api/workspace/skills")
def get_skills():
    """Return list of skill files."""
    skills = workspace_reader.discover_skills(_WORKSPACE_PATH)
    return jsonify({"skills": skills, "count": len(skills)})


@app.route("/api/workspace/skills/<filename>")
def get_skill(filename):
    """Return single skill file content."""
    result = workspace_reader.read_skill(_WORKSPACE_PATH, filename)
    if result is None:
        return jsonify({"error": "File not found or access denied"}), 404
    return jsonify(result)


@app.route("/api/workspace/sessions")
def get_session_extracts():
    """Return list of session extract files."""
    extracts = workspace_reader.discover_session_extracts(_WORKSPACE_PATH)
    return jsonify({"extracts": extracts, "count": len(extracts)})


@app.route("/api/workspace/sessions/<filename>")
def get_session_extract(filename):
    """Return single session extract content."""
    result = workspace_reader.read_session_extract(_WORKSPACE_PATH, filename)
    if result is None:
        return jsonify({"error": "File not found or access denied"}), 404
    return jsonify(result)


# ---------------------------------------------------------------------------
# Static / SPA catch-all  (MUST be after all API routes)
# ---------------------------------------------------------------------------

@app.route("/<path:path>")
def static_files(path):
    # Never handle /api/* here
    if path.startswith("api/"):
        abort(404)
    # Try static directory first, fall back to index.html for SPA routes
    full = STATIC_DIR / path
    if full.exists() and full.is_file():
        return send_from_directory(str(STATIC_DIR), path)
    # SPA fallback
    return send_from_directory(str(STATIC_DIR), "index.html")


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("DASHBOARD_PORT", 39876))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    print(f"Pinchy Dashboard running on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
