# Pinchy Dashboard — Setup Guide

A modern dashboard for monitoring your OpenClaw AI agent: token tracking, cost charts, goal management, content planning, learning log, calendar, chat, and agent health status.

## Quick Start — Docker Hub (Recommended)

Pull the prebuilt image from Docker Hub:

```bash
docker pull finalbillybong/pinchy-dash:latest
```

### Using Docker Compose

```bash
# Clone the repo for the compose file
git clone https://github.com/finalbillybong/pinchy-dash.git
cd pinchy-dash
docker compose up -d
```

This will:
- Pull the Pinchy Dashboard image from Docker Hub (or build locally)
- Mount your OpenClaw session data (read-only) for the collector
- Create a persistent volume for dashboard state (config, chat history, goals, etc.)

### Using Docker Run

```bash
docker run -d \
  --name pinchy-dash \
  -p 39876:39876 \
  -v ~/.openclaw:/root/.openclaw:ro \
  -v pinchy-data:/app/data \
  --restart unless-stopped \
  finalbillybong/pinchy-dash:latest
```

### Open in your browser

Go to **http://localhost:39876**

On first launch, the **onboarding wizard** will guide you through:
1. **Connect** — Enter your OpenClaw Gateway URL and token
2. **Model** — Set the agent model ID
3. **Calendar** — Discover and enable calendars
4. **Done** — Summary and launch

### Environment Variables (optional)

You can pre-configure these in a `.env` file or pass them to `docker compose`:

| Variable | Default | Description |
|---|---|---|
| `OPENCLAW_GATEWAY_URL` | *(empty)* | OpenClaw Gateway URL (e.g. `http://192.168.1.100:18789`). If not set, configure via onboarding wizard. |
| `OPENCLAW_GATEWAY_TOKEN` | *(empty)* | Gateway auth token. If not set, configure via UI. |
| `OPENCLAW_DATA_DIR` | `~/.openclaw` | Path to OpenClaw data directory on the host (mounted read-only) |
| `CALENDAR_DATA_DIR` | *(empty)* | Path to vdirsyncer calendar data on host (optional, auto-detected from OpenClaw mount) |
| `DASHBOARD_API_KEY` | *(empty)* | If set, write API endpoints require `Authorization: Bearer <key>` |
| `DASHBOARD_PORT` | `39876` | Port the dashboard server listens on |
| `FLASK_DEBUG` | `0` | Set to `1` for dev mode (auto-reload) |
| `OPENCLAW_SESSIONS` | `/root/.openclaw/agents/main/sessions` | Path to OpenClaw session files inside the container |

### Example with environment variables

```bash
OPENCLAW_GATEWAY_URL=http://192.168.1.100:18789 \
OPENCLAW_GATEWAY_TOKEN=your-token \
docker compose up -d
```

### Stopping / restarting

```bash
docker compose down      # stop
docker compose up -d     # start
docker compose restart   # restart
```

Your data (config, chat history, goals, etc.) persists across restarts in the `pinchy-data` Docker volume.

---

## Unraid Deployment

1. Copy `pinchy-dash.xml` to `/boot/config/plugins/dockerMan/templates-user/` on your Unraid server
2. In Unraid Docker tab, click **Add Container** and select **Pinchy Dashboard** from the template dropdown
3. Configure the volume paths:
   - **OpenClaw Data Path**: usually `/mnt/user/appdata/openclaw`
   - **Calendar Data Path**: (optional) path to vdirsyncer calendar data, or leave empty for auto-detection
4. Click **Apply** to start the container
5. Open the Web UI at `http://your-unraid-ip:39876`

All settings (Gateway URL, token, model, calendars, etc.) can be configured through the onboarding wizard on first launch, or via the Unraid Docker UI environment variables.

---

## Alternative: Quick Start (Local / No Docker)

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the dashboard server
python app.py

# 3. In a separate terminal, start the data collector loop
nohup bash dashboard-loop.sh &
```

Open **http://localhost:39876** in your browser.

---

## Alternative: Running Inside OpenClaw's Docker Container

If your OpenClaw agent runs in a Docker container and you want the dashboard there too:

### Step 1: Copy files into the container

```bash
docker cp "Pinchy Dash/." <container_id>:/root/pinchy-dash/
```

### Step 2: Install dependencies inside the container

```bash
docker exec -it <container_id> pip install flask requests
```

### Step 3: Start the dashboard

```bash
docker exec -it <container_id> bash -c "cd /root/pinchy-dash && nohup bash dashboard-loop.sh & python3 app.py &"
```

### Step 4: Expose the port

Make sure port **39876** is exposed in your Docker run command:

```bash
docker run -p 39876:39876 ... your-openclaw-image
```

---

## Configuration

### Chat Feature

The chat feature connects to your OpenClaw Gateway's OpenAI-compatible Chat Completions endpoint. For it to work:

1. Set your Gateway URL and token (via onboarding wizard or Settings page)
2. Ensure the Chat Completions endpoint is enabled in your OpenClaw config:

```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
}
```

### Calendar

Calendar events are read directly from `.ics` files in your OpenClaw container's vdirsyncer directory. Pinchy auto-detects the calendar path from the OpenClaw volume mount. If auto-detection fails, you can:

1. Mount the vdirsyncer directory explicitly (e.g. `-v /path/to/vdirsyncer/calendars:/calendars:ro`)
2. Set the path in Settings > Calendar

As a fallback, Pinchy can ask the OpenClaw agent to run `khal list` via chat if no ICS files are found.

### Currency

Costs are displayed in USD by default. Go to **Settings > Currency** to change to your preferred currency (e.g. GBP, EUR). Exchange rates are fetched live from a free API.

### Security

- **Local only**: no API key needed; the dashboard is only accessible from your machine.
- **Exposed to network**: set `DASHBOARD_API_KEY` to protect write endpoints.

```bash
export DASHBOARD_API_KEY="your-secret-key-here"
```

---

## File Structure

```
pinchy-dash/
  Dockerfile            # Container build definition
  docker-compose.yml    # Orchestration with volume mounts
  pinchy-dash.xml       # Unraid Docker template
  .dockerignore         # Excludes data/, .git, etc. from build
  .github/workflows/    # GitHub Actions for Docker Hub publishing
  app.py                # Flask server (API + static file serving)
  collector.py          # Data collector (reads sessions, calendar, agent health)
  ics_reader.py         # ICS calendar file parser
  memory_reader.py      # OpenClaw memory file reader
  workspace_reader.py   # OpenClaw workspace file reader
  dashboard-loop.sh     # Runs collector every 5 minutes
  requirements.txt      # Python dependencies
  SETUP.md              # This file
  static/
    index.html          # Dashboard SPA shell
    pinchy-icon.png     # App icon / favicon
    css/style.css       # Stylesheet
    js/
      app.js            # Router, shared utilities, onboarding wizard
      charts.js         # Chart.js wrappers
      dashboard.js      # Home view
      sessions.js       # Sessions view
      goals.js          # Goals view
      content.js        # Content tracker view
      learning.js       # Learning log (reads agent memory files)
      calendar.js       # Calendar view
      chat.js           # Chat view (talks to OpenClaw via Gateway)
      settings.js       # Settings view (Gateway, currency, branding)
  data/                 # Auto-created; persisted via Docker volume
    data.json           # Collector output
    history.json        # Cost history
    config.json         # Dashboard settings
    chat_history.json   # Server-side chat history
    learning.json       # Manual learning entries
    goals.json          # Goals
    content.json        # Content items
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/data` | Collector data (sessions, tokens, calendar, etc.) |
| GET | `/api/history` | Cost history |
| GET | `/api/learning` | Learning entries |
| POST | `/api/learning` | Add learning entry |
| DELETE | `/api/learning/<id>` | Delete learning entry |
| GET | `/api/goals` | Goals list |
| POST | `/api/goals` | Create goal |
| PUT | `/api/goals/<id>` | Update goal |
| DELETE | `/api/goals/<id>` | Delete goal |
| GET | `/api/content` | Content items |
| POST | `/api/content` | Create content item |
| PUT | `/api/content/<id>` | Update content item |
| DELETE | `/api/content/<id>` | Delete content item |
| POST | `/api/chat` | Chat proxy (streams SSE from Gateway) |
| GET | `/api/chat/status` | Chat configuration status |
| GET | `/api/chat/history` | Retrieve chat history |
| POST | `/api/chat/history` | Save chat history |
| DELETE | `/api/chat/history` | Clear chat history |
| GET | `/api/calendars/discover` | Scan for available ICS calendars |
| GET | `/api/calendars/events` | Read upcoming calendar events |
| GET | `/api/memory` | List agent memory files |
| GET | `/api/memory/<file>` | Read a single memory file |
| GET | `/api/workspace/identity` | Agent identity (IDENTITY.md) |
| GET | `/api/workspace/heartbeat` | Agent heartbeat status |
| GET | `/api/workspace/tools` | Agent tools list |
| GET | `/api/workspace/skills` | Agent skills list |
| GET | `/api/workspace/sessions` | Session extracts |
| GET | `/api/settings` | Get dashboard settings |
| POST | `/api/settings` | Save dashboard settings |
| POST | `/api/settings/test` | Test Gateway connection |
| POST | `/api/settings/rates` | Fetch live exchange rates |
