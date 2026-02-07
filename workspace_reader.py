#!/usr/bin/env python3
"""
Workspace Reader — reads IDENTITY.md, HEARTBEAT.md, TOOLS.md, skills/,
and session-extracts/ from the mounted OpenClaw workspace volume.
"""

import os
import re
from datetime import datetime, timedelta
from pathlib import Path

# Default base: the openclaw mount root
DEFAULT_WORKSPACE = "/root/.openclaw/workspace"


def read_identity(base_path=None):
    """
    Read IDENTITY.md and extract bot name, description, and raw content.
    Returns: { "name": "Pinchy", "description": "...", "raw": "full markdown" }
    """
    ws = Path(base_path or DEFAULT_WORKSPACE)
    identity_file = ws / "IDENTITY.md"
    if not identity_file.exists():
        return None

    try:
        raw = identity_file.read_text("utf-8")
    except Exception:
        return None

    name = ""
    description = ""

    # 1. Look for structured "- **Name:** value" field (preferred)
    name_match = re.search(r'-\s*\*\*Name:\*\*\s*(.+)', raw)
    if name_match:
        name = name_match.group(1).strip()

    # 2. Fallback: first heading (strip common suffixes like "- Who Am I?")
    if not name:
        for line in raw.split("\n"):
            line = line.strip()
            if line.startswith("# "):
                heading = line[2:].strip()
                # Remove "IDENTITY.md" prefix and decorative suffixes
                heading = re.sub(r'^IDENTITY\.md\s*[-–—]\s*', '', heading).strip()
                heading = re.sub(r'\s*[-–—]\s*Who Am I\??$', '', heading, flags=re.IGNORECASE).strip()
                if heading:
                    name = heading
                break

    # Extract first non-heading, non-empty line as description
    for line in raw.split("\n"):
        line = line.strip()
        if line and not line.startswith("#") and not line.startswith("- **"):
            description = line
            break

    return {
        "name": name,
        "description": description,
        "raw": raw,
    }


def read_heartbeat(base_path=None, threshold_minutes=10):
    """
    Read HEARTBEAT.md and check if agent was recently active.
    Returns: { "alive": true, "last_beat": "2026-02-07T10:30:00", "content": "..." }
    """
    ws = Path(base_path or DEFAULT_WORKSPACE)
    hb_file = ws / "HEARTBEAT.md"
    if not hb_file.exists():
        return {"alive": False, "last_beat": None, "content": ""}

    try:
        content = hb_file.read_text("utf-8")
        stat = hb_file.stat()
        mtime = datetime.fromtimestamp(stat.st_mtime)
    except Exception:
        return {"alive": False, "last_beat": None, "content": ""}

    age = datetime.now() - mtime
    alive = age < timedelta(minutes=threshold_minutes)

    return {
        "alive": alive,
        "last_beat": mtime.isoformat(),
        "content": content,
    }


def read_tools(base_path=None):
    """
    Read TOOLS.md and parse tool names and descriptions.
    Returns list of: { "name": "exec", "description": "..." }
    """
    ws = Path(base_path or DEFAULT_WORKSPACE)
    tools_file = ws / "TOOLS.md"
    if not tools_file.exists():
        return []

    try:
        content = tools_file.read_text("utf-8")
    except Exception:
        return []

    tools = []
    current_name = None
    current_desc_lines = []

    for line in content.split("\n"):
        stripped = line.strip()

        # Match ## or ### tool headers
        m = re.match(r"^#{2,3}\s+(.+)", stripped)
        if m:
            # Save previous tool
            if current_name:
                tools.append({
                    "name": current_name,
                    "description": " ".join(current_desc_lines).strip()[:200],
                })
            current_name = m.group(1).strip()
            current_desc_lines = []
            continue

        # Match "- **toolname**: description" format
        m2 = re.match(r"^[-*]\s+\*\*(.+?)\*\*[:\s]*(.+)?", stripped)
        if m2:
            if current_name and current_name != m2.group(1):
                tools.append({
                    "name": current_name,
                    "description": " ".join(current_desc_lines).strip()[:200],
                })
            current_name = m2.group(1).strip()
            current_desc_lines = [m2.group(2).strip()] if m2.group(2) else []
            continue

        # Description continuation lines
        if current_name and stripped and not stripped.startswith("#"):
            current_desc_lines.append(stripped)

    # Save last tool
    if current_name:
        tools.append({
            "name": current_name,
            "description": " ".join(current_desc_lines).strip()[:200],
        })

    return tools


def discover_skills(base_path=None):
    """
    Scan skills/ directory for .md files.
    Returns list of: { "id": "skill-name", "filename": "skill-name.md", "modified": "..." }
    """
    ws = Path(base_path or DEFAULT_WORKSPACE)
    skills_dir = ws / "skills"
    if not skills_dir.exists():
        return []

    skills = []
    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_file() or entry.suffix != ".md":
            continue
        try:
            mtime = datetime.fromtimestamp(entry.stat().st_mtime).isoformat()
        except Exception:
            mtime = ""
        skills.append({
            "id": entry.stem,
            "filename": entry.name,
            "modified": mtime,
        })

    return skills


def read_skill(base_path, filename):
    """
    Read a single skill file with path traversal protection.
    Returns: { "filename", "content", "modified" } or None.
    """
    ws = Path(base_path or DEFAULT_WORKSPACE)
    skills_dir = ws / "skills"
    safe = _safe_path(skills_dir, filename)
    if safe is None or not safe.exists():
        return None

    try:
        content = safe.read_text("utf-8")
        mtime = datetime.fromtimestamp(safe.stat().st_mtime).isoformat()
    except Exception:
        return None

    return {
        "filename": filename,
        "content": content,
        "modified": mtime,
    }


def discover_session_extracts(base_path=None):
    """
    Scan session-extracts/ directory for files.
    Returns list with filename, modified date, size.
    """
    ws = Path(base_path or DEFAULT_WORKSPACE)
    extracts_dir = ws / "session-extracts"
    if not extracts_dir.exists():
        return []

    extracts = []
    for entry in sorted(extracts_dir.iterdir(), key=lambda f: f.stat().st_mtime, reverse=True):
        if not entry.is_file():
            continue
        try:
            stat = entry.stat()
            mtime = datetime.fromtimestamp(stat.st_mtime).isoformat()
            size = stat.st_size
        except Exception:
            mtime = ""
            size = 0
        extracts.append({
            "id": entry.stem,
            "filename": entry.name,
            "modified": mtime,
            "size": size,
        })

    return extracts


def read_session_extract(base_path, filename):
    """
    Read a single session extract file with path traversal protection.
    Returns: { "filename", "content", "modified" } or None.
    """
    ws = Path(base_path or DEFAULT_WORKSPACE)
    extracts_dir = ws / "session-extracts"
    safe = _safe_path(extracts_dir, filename)
    if safe is None or not safe.exists():
        return None

    try:
        content = safe.read_text("utf-8")
        mtime = datetime.fromtimestamp(safe.stat().st_mtime).isoformat()
    except Exception:
        return None

    return {
        "filename": filename,
        "content": content,
        "modified": mtime,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _safe_path(base, filename):
    """Resolve a filename safely within the base directory."""
    try:
        resolved = (base / filename).resolve()
        base_resolved = base.resolve()
        if str(resolved).startswith(str(base_resolved)):
            return resolved
    except Exception:
        pass
    return None
