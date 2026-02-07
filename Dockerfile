FROM python:3.11-slim

LABEL org.opencontainers.image.title="Pinchy Dashboard"
LABEL org.opencontainers.image.description="Modern monitoring dashboard for OpenClaw AI agents — tracks tokens, costs, sessions, chat, calendar, and agent health"
LABEL org.opencontainers.image.source="https://github.com/finalbillybong/pinchy-dash"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="finalbillybong"

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py collector.py ics_reader.py memory_reader.py workspace_reader.py dashboard-loop.sh ./
COPY static/ static/

# Create data directory (will be overridden by volume mount)
RUN mkdir -p data

EXPOSE 39876

# Start both the collector loop and the Flask server
CMD ["bash", "-c", "bash dashboard-loop.sh & python3 app.py"]
