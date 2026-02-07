#!/usr/bin/env python3
"""
Dashboard data collector for Pinchy.
Reads session data and outputs dashboard-friendly JSON.
Run via cron or manually to update dashboard/data.json
"""

import json
import os
import subprocess
import re
from datetime import datetime, timedelta
from pathlib import Path

DASHBOARD_DIR = Path(__file__).parent.parent / "dashboard"
DATA_FILE = DASHBOARD_DIR / "data.json"
HISTORY_FILE = DASHBOARD_DIR / "history.json"
LEARNING_FILE = DASHBOARD_DIR / "learning.json"
WORKSPACE = Path(__file__).parent.parent

def run_command(cmd):
    """Run shell command and return output."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        return result.stdout.strip()
    except Exception as e:
        print(f"Command failed: {e}")
        return ""

def get_calendar_events():
    """Get upcoming calendar events from khal."""
    events = []
    try:
        # Get events for next 7 days
        output = run_command('khal list today 7d --format "{start-date}|{start-time}|{end-time}|{title}|{calendar}" 2>/dev/null')
        if output:
            current_date = None
            for line in output.split('\n'):
                if not line.strip():
                    continue
                # Date headers look like "Today, 07/02/2026" or "Monday, 10/02/2026"
                if '|' not in line:
                    current_date = line.strip()
                    continue
                parts = line.split('|')
                if len(parts) >= 4:
                    events.append({
                        "date": current_date or parts[0],
                        "time": parts[1] if parts[1] else "All day",
                        "end": parts[2] if len(parts) > 2 else "",
                        "title": parts[3] if len(parts) > 3 else "",
                        "calendar": parts[4] if len(parts) > 4 else ""
                    })
    except Exception as e:
        print(f"Calendar error: {e}")
    return events[:15]  # Limit to 15 events

def get_learning_entries():
    """Get learning entries from learning.json."""
    if LEARNING_FILE.exists():
        try:
            with open(LEARNING_FILE) as f:
                data = json.load(f)
                return data.get("entries", [])[-20:]  # Last 20
        except:
            pass
    return []

def add_learning_entry(entry_type, title, detail="", outcome=""):
    """Add a new learning entry."""
    entries = []
    if LEARNING_FILE.exists():
        try:
            with open(LEARNING_FILE) as f:
                entries = json.load(f).get("entries", [])
        except:
            pass
    
    entries.append({
        "id": len(entries) + 1,
        "type": entry_type,  # decision, lesson, observation
        "title": title,
        "detail": detail,
        "outcome": outcome,
        "date": datetime.now().strftime("%Y-%m-%d %H:%M")
    })
    
    # Keep last 100
    entries = entries[-100:]
    
    with open(LEARNING_FILE, "w") as f:
        json.dump({"entries": entries}, f, indent=2)
    
    return entries[-1]

def get_session_stats():
    """Get session stats from OpenClaw."""
    # This would ideally call the sessions_list API, but we'll parse session files
    sessions_dir = Path("/root/.openclaw/agents/main/sessions")
    sessions = []
    total_tokens = 0
    today_tokens = 0
    today = datetime.now().strftime("%Y-%m-%d")
    
    if sessions_dir.exists():
        for session_file in sessions_dir.glob("*.jsonl"):
            try:
                stat = session_file.stat()
                size_kb = stat.st_size / 1024
                mtime = datetime.fromtimestamp(stat.st_mtime)
                
                # Estimate tokens from file size (rough: ~4 chars per token, ~1 byte per char)
                est_tokens = int(stat.st_size / 4)
                total_tokens += est_tokens
                
                if mtime.strftime("%Y-%m-%d") == today:
                    today_tokens += est_tokens
                
                sessions.append({
                    "key": session_file.stem,
                    "name": session_file.stem[:20],
                    "tokens": est_tokens,
                    "cost": est_tokens * 0.000015,  # Rough Opus pricing
                    "updated": mtime.isoformat()
                })
            except Exception as e:
                continue
    
    # Sort by most recent
    sessions.sort(key=lambda x: x.get("updated", ""), reverse=True)
    
    return {
        "sessions": sessions[:10],  # Top 10
        "sessionCount": len(sessions),
        "totalTokens": total_tokens,
        "todayTokens": today_tokens
    }

def load_history():
    """Load cost history."""
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE) as f:
                return json.load(f)
        except:
            pass
    return {"daily": {}}

def save_history(history):
    """Save cost history."""
    DASHBOARD_DIR.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)

def get_uptime():
    """Get gateway uptime in milliseconds."""
    try:
        uptime_out = run_command("ps -o etimes= -p $(pgrep -f 'openclaw' | head -1) 2>/dev/null")
        if uptime_out:
            return int(uptime_out) * 1000
    except:
        pass
    return None

def main():
    # Get session stats
    stats = get_session_stats()
    
    # Load and update history
    history = load_history()
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Estimate today's cost from tokens
    today_cost = stats["todayTokens"] * 0.000015  # Rough estimate
    history["daily"][today] = today_cost
    
    # Keep only last 30 days
    cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    history["daily"] = {k: v for k, v in history["daily"].items() if k >= cutoff}
    save_history(history)
    
    # Build 7-day chart data
    chart_data = []
    for i in range(6, -1, -1):
        day = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        day_label = (datetime.now() - timedelta(days=i)).strftime("%a")
        cost = history["daily"].get(day, 0)
        chart_data.append({"day": day_label, "cost": cost})
    
    # Calculate cost change
    yesterday_cost = history["daily"].get(yesterday, 0)
    cost_change = today_cost - yesterday_cost
    
    # Get calendar and learning data
    calendar_events = get_calendar_events()
    learning_entries = get_learning_entries()
    
    # Build output
    data = {
        "todayCost": today_cost,
        "costChange": cost_change,
        "totalTokens": stats["totalTokens"],
        "todayTokens": stats["todayTokens"],
        "sessionCount": stats["sessionCount"],
        "sessions": stats["sessions"],
        "history": chart_data,
        "uptimeMs": get_uptime(),
        "calendar": calendar_events,
        "learning": learning_entries,
        "generatedAt": datetime.now().isoformat()
    }
    
    # Write output
    DASHBOARD_DIR.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)
    
    print(f"Dashboard data updated: {DATA_FILE}")
    print(f"  Today's cost: ${today_cost:.4f}")
    print(f"  Total tokens: {stats['totalTokens']:,}")
    print(f"  Sessions: {stats['sessionCount']}")

if __name__ == "__main__":
    main()
