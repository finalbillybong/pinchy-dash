#!/bin/bash
# Serve the dashboard on port 8080
cd /root/.openclaw/workspace/dashboard
echo "🦀 Dashboard running at http://localhost:8080"
python3 -m http.server 39876 --bind 0.0.0.0
