#!/usr/bin/env python3
"""
ICS Calendar Reader — reads .ics files from vdir directories.
Used by the collector and Flask API to display calendar events
without needing khal or any Gateway API calls.
"""

import os
import re
from datetime import datetime, timedelta, date, time as dt_time
from pathlib import Path

try:
    from icalendar import Calendar
    from dateutil.rrule import rrulestr
    from dateutil.tz import tzlocal, tzutc
    HAS_ICAL = True
except ImportError:
    HAS_ICAL = False


_FALLBACK_PATHS = [
    "/calendars",                                          # dedicated mount
    "/root/.openclaw/../.local/share/vdirsyncer/calendars", # OpenClaw home mount
    "/root/.local/share/vdirsyncer/calendars",              # direct home path
]


def find_calendar_path(configured_path="/calendars"):
    """
    Try to locate a valid calendar directory using a fallback chain:
      1. The user-configured path (from settings)
      2. Known vdirsyncer paths reachable via the OpenClaw volume mount
    Returns (resolved_path, source) or (None, None).
    """
    # Build ordered list: configured path first, then fallbacks
    paths_to_try = [configured_path] if configured_path else []
    for fb in _FALLBACK_PATHS:
        if fb not in paths_to_try:
            paths_to_try.append(fb)

    for p in paths_to_try:
        resolved = Path(p).resolve()
        if resolved.exists() and resolved.is_dir():
            # Check if it actually has calendar subdirs with .ics files
            for child in resolved.iterdir():
                if child.is_dir() and list(child.glob("*.ics")):
                    source = "configured" if p == configured_path else "auto-detected"
                    return str(resolved), source
    return None, None


def discover_calendars(base_path):
    """
    Scan base_path for subdirectories containing .ics files.
    Returns list of calendar dicts:
      { "id": "personal", "name": "Personal", "path": "...", "event_count": 42 }
    """
    base = Path(base_path)
    if not base.exists():
        return []

    calendars = []
    for entry in sorted(base.iterdir()):
        if not entry.is_dir():
            continue
        ics_files = list(entry.glob("*.ics"))
        if not ics_files:
            continue

        cal_id = entry.name
        # Try to read vdir displayname file
        displayname_file = entry / "displayname"
        if displayname_file.exists():
            try:
                name = displayname_file.read_text("utf-8").strip()
            except Exception:
                name = _friendly_name(cal_id)
        else:
            name = _friendly_name(cal_id)

        # Try to read color file
        color = ""
        color_file = entry / "color"
        if color_file.exists():
            try:
                color = color_file.read_text("utf-8").strip()
            except Exception:
                pass

        calendars.append({
            "id": cal_id,
            "name": name,
            "path": str(entry),
            "event_count": len(ics_files),
            "color": color,
        })

    return calendars


def read_calendar_events(base_path, calendar_ids=None, days_ahead=7):
    """
    Read .ics files from selected calendars and return upcoming events.

    Args:
        base_path: Root directory containing calendar subdirectories
        calendar_ids: List of calendar IDs to read (None = all)
        days_ahead: How many days ahead to look

    Returns:
        Sorted list of event dicts:
        { "date", "time", "end", "title", "location", "calendar", "all_day" }
    """
    if not HAS_ICAL:
        return []

    base = Path(base_path)
    if not base.exists():
        return []

    now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = now + timedelta(days=days_ahead)
    events = []

    for entry in base.iterdir():
        if not entry.is_dir():
            continue
        if calendar_ids is not None and entry.name not in calendar_ids:
            continue

        cal_name = _friendly_name(entry.name)
        # Check displayname
        dn = entry / "displayname"
        if dn.exists():
            try:
                cal_name = dn.read_text("utf-8").strip() or cal_name
            except Exception:
                pass

        for ics_file in entry.glob("*.ics"):
            try:
                parsed = _parse_ics_file(ics_file, now, end_date, cal_name)
                events.extend(parsed)
            except Exception:
                continue

    # Sort by start datetime
    events.sort(key=lambda e: e.get("_sort_key", ""))
    # Remove internal sort key and cap
    for e in events:
        e.pop("_sort_key", None)
    return events[:50]


def _parse_ics_file(path, range_start, range_end, cal_name):
    """Parse a single .ics file and return events within the date range."""
    events = []
    try:
        with open(path, "rb") as f:
            cal = Calendar.from_ical(f.read())
    except Exception:
        return []

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        try:
            summary = str(component.get("SUMMARY", "Untitled"))
            location = str(component.get("LOCATION", ""))
            dtstart = component.get("DTSTART")
            dtend = component.get("DTEND")

            if dtstart is None:
                continue

            dt_val = dtstart.dt

            # Handle recurring events
            rrule = component.get("RRULE")
            if rrule:
                try:
                    occurrences = _expand_rrule(component, range_start, range_end)
                    for occ_start, occ_end in occurrences:
                        ev = _make_event(occ_start, occ_end, summary, location, cal_name)
                        if ev:
                            events.append(ev)
                    continue
                except Exception:
                    pass  # Fall through to single-event handling

            # Single (non-recurring) event
            end_val = dtend.dt if dtend else None
            ev = _check_and_make_event(dt_val, end_val, range_start, range_end,
                                       summary, location, cal_name)
            if ev:
                events.append(ev)

        except Exception:
            continue

    return events


def _expand_rrule(component, range_start, range_end):
    """Expand a recurring event into individual occurrences within the range."""
    dtstart = component.get("DTSTART").dt
    dtend = component.get("DTEND")
    duration = None
    if dtend:
        end_val = dtend.dt
        if isinstance(dtstart, date) and not isinstance(dtstart, datetime):
            duration = end_val - dtstart
        elif isinstance(dtstart, datetime):
            if isinstance(end_val, datetime):
                duration = end_val - dtstart
            else:
                duration = timedelta(hours=1)
        else:
            duration = timedelta(hours=1)
    else:
        duration = timedelta(hours=1)

    rrule_str = component.get("RRULE").to_ical().decode("utf-8")

    # Make range_start timezone-aware if dtstart is
    r_start = range_start
    r_end = range_end
    if isinstance(dtstart, datetime) and dtstart.tzinfo:
        r_start = range_start.replace(tzinfo=dtstart.tzinfo)
        r_end = range_end.replace(tzinfo=dtstart.tzinfo)

    rule = rrulestr(rrule_str, dtstart=dtstart)

    occurrences = []
    for occ in rule:
        if isinstance(occ, datetime) and occ.tzinfo and r_start.tzinfo is None:
            occ = occ.replace(tzinfo=None)
        if occ > r_end:
            break
        if isinstance(occ, date) and not isinstance(occ, datetime):
            occ_end = occ + duration if duration else occ
        else:
            occ_end = occ + duration if duration else occ
        if occ >= r_start or (occ_end and occ_end >= r_start):
            occurrences.append((occ, occ_end))
        if len(occurrences) >= 50:
            break

    return occurrences


def _check_and_make_event(dt_val, end_val, range_start, range_end,
                          summary, location, cal_name):
    """Check if a single event falls within range and create event dict."""
    if isinstance(dt_val, datetime):
        start_naive = dt_val.replace(tzinfo=None) if dt_val.tzinfo else dt_val
    elif isinstance(dt_val, date):
        start_naive = datetime.combine(dt_val, dt_time.min)
    else:
        return None

    if start_naive > range_end:
        return None

    if end_val:
        if isinstance(end_val, datetime):
            end_naive = end_val.replace(tzinfo=None) if end_val.tzinfo else end_val
        elif isinstance(end_val, date):
            end_naive = datetime.combine(end_val, dt_time.min)
        else:
            end_naive = start_naive + timedelta(hours=1)
    else:
        end_naive = start_naive + timedelta(hours=1)

    if end_naive < range_start:
        return None

    return _make_event(dt_val, end_val, summary, location, cal_name)


def _make_event(dt_val, end_val, summary, location, cal_name):
    """Create a standardized event dict."""
    all_day = False
    if isinstance(dt_val, date) and not isinstance(dt_val, datetime):
        all_day = True
        date_str = dt_val.strftime("%Y-%m-%d")
        time_str = "All day"
        sort_key = dt_val.strftime("%Y-%m-%d 00:00")
    elif isinstance(dt_val, datetime):
        dt_naive = dt_val.replace(tzinfo=None) if dt_val.tzinfo else dt_val
        date_str = dt_naive.strftime("%Y-%m-%d")
        time_str = dt_naive.strftime("%H:%M")
        sort_key = dt_naive.strftime("%Y-%m-%d %H:%M")
    else:
        return None

    end_str = ""
    if end_val:
        if isinstance(end_val, datetime):
            en = end_val.replace(tzinfo=None) if end_val.tzinfo else end_val
            end_str = en.strftime("%H:%M")
        elif isinstance(end_val, date) and not all_day:
            end_str = ""

    return {
        "date": date_str,
        "time": time_str,
        "end": end_str,
        "title": summary,
        "location": location,
        "calendar": cal_name,
        "all_day": all_day,
        "_sort_key": sort_key,
    }


def _friendly_name(dir_name):
    """Convert directory name to a friendly display name."""
    return dir_name.replace("_", " ").replace("-", " ").title()
