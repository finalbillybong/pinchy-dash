#!/usr/bin/env python3
"""
Memory Reader — reads OpenClaw memory/learning files from the mounted volume.
Discovers daily notes, topic memories, and JSON data files.
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

# Default path inside the container (read-only mount)
DEFAULT_MEMORY_PATH = "/root/.openclaw/workspace/memory"

_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def discover_memory_files(base_path=None):
    """
    Scan the memory directory for .md and .json files.
    Returns list of file descriptors:
      { "id", "filename", "type" (daily|topic|data), "modified", "size" }
    """
    base = Path(base_path or DEFAULT_MEMORY_PATH)
    if not base.exists():
        return []

    files = []
    for entry in base.iterdir():
        if entry.is_dir():
            # Recurse one level for subdirs like weekly-summaries/
            for sub in entry.iterdir():
                if sub.is_file() and sub.suffix in (".md", ".json"):
                    files.append(_describe_file(sub, base))
        elif entry.is_file() and entry.suffix in (".md", ".json"):
            files.append(_describe_file(entry, base))

    # Sort: daily notes newest first, then topics, then data
    type_order = {"daily": 0, "topic": 1, "data": 2}
    files.sort(key=lambda f: (type_order.get(f["type"], 9), f.get("modified", "")), reverse=True)
    # Re-sort daily by date descending, others by modified descending
    daily = [f for f in files if f["type"] == "daily"]
    daily.sort(key=lambda f: f["id"], reverse=True)
    topics = [f for f in files if f["type"] == "topic"]
    topics.sort(key=lambda f: f["modified"], reverse=True)
    data = [f for f in files if f["type"] == "data"]
    data.sort(key=lambda f: f["modified"], reverse=True)

    return daily + topics + data


def read_memory_file(base_path, filename):
    """
    Read a single memory file. Returns:
      { "filename", "content", "type", "modified" }
    Returns None if file doesn't exist or path traversal detected.
    """
    base = Path(base_path or DEFAULT_MEMORY_PATH)
    # Security: prevent path traversal
    safe = _safe_path(base, filename)
    if safe is None or not safe.exists():
        return None

    try:
        content = safe.read_text("utf-8")
    except Exception:
        return None

    ftype = _classify(safe)
    try:
        mtime = datetime.fromtimestamp(safe.stat().st_mtime).isoformat()
    except Exception:
        mtime = ""

    return {
        "filename": filename,
        "content": content,
        "type": ftype,
        "modified": mtime,
    }


def get_recent_entries(base_path=None, limit=20):
    """
    Read the most recent daily notes and extract section headers as summaries.
    Returns list of:
      { "date": "2026-02-07", "sections": ["Calendar Fix", ...], "preview": "..." }
    """
    base = Path(base_path or DEFAULT_MEMORY_PATH)
    if not base.exists():
        return []

    # Find daily note files
    daily_files = []
    for entry in base.iterdir():
        if entry.is_file() and entry.suffix == ".md":
            stem = entry.stem
            if _DATE_PATTERN.match(stem):
                daily_files.append(entry)

    daily_files.sort(key=lambda f: f.stem, reverse=True)
    daily_files = daily_files[:limit]

    entries = []
    for f in daily_files:
        try:
            content = f.read_text("utf-8")
            sections = _extract_sections(content)
            preview = _extract_preview(content, 200)
            entries.append({
                "date": f.stem,
                "filename": f.name,
                "sections": sections,
                "preview": preview,
            })
        except Exception:
            continue

    return entries


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _describe_file(path, base):
    """Create a file descriptor dict."""
    rel = path.relative_to(base)
    ftype = _classify(path)
    try:
        stat = path.stat()
        mtime = datetime.fromtimestamp(stat.st_mtime).isoformat()
        size = stat.st_size
    except Exception:
        mtime = ""
        size = 0

    file_id = path.stem
    return {
        "id": file_id,
        "filename": str(rel),
        "type": ftype,
        "modified": mtime,
        "size": size,
    }


def _classify(path):
    """Classify a file as daily, topic, or data."""
    if path.suffix == ".json":
        return "data"
    stem = path.stem
    if _DATE_PATTERN.match(stem):
        return "daily"
    return "topic"


def _extract_sections(content):
    """Extract ## section headers from markdown content."""
    sections = []
    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("## "):
            title = line[3:].strip()
            # Remove trailing time ranges like (08:48-08:52)
            title = re.sub(r"\s*\([\d:–-]+\)\s*$", "", title)
            if title:
                sections.append(title)
    return sections


def _extract_preview(content, max_len=200):
    """Extract the first meaningful paragraph as a preview."""
    lines = content.split("\n")
    text_lines = []
    for line in lines:
        line = line.strip()
        if not line:
            if text_lines:
                break
            continue
        if line.startswith("#"):
            if text_lines:
                break
            continue
        text_lines.append(line)

    preview = " ".join(text_lines)
    if len(preview) > max_len:
        preview = preview[:max_len].rsplit(" ", 1)[0] + "..."
    return preview


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
