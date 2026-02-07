#!/bin/bash
# Dashboard collector loop — runs collector.py every 5 minutes.
# Usage:  nohup bash dashboard-loop.sh &

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

while true; do
  python3 "$SCRIPT_DIR/collector.py"
  sleep 300
done
