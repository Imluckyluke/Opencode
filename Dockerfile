FROM node:20-slim

# Install OpenCode CLI
RUN npm install -g opencode-ai

# Preconfigure default model (Zen anonymous free lane — no API key/login needed)
RUN mkdir -p /root/.config/opencode
COPY opencode.json /root/.config/opencode/opencode.json

# Telegram relay bot (no extra deps — uses Node 20's built-in fetch)
WORKDIR /app
COPY bot.js /app/bot.js

WORKDIR /workspace

# Set real values for these in Railway's Variables tab
ENV OPENCODE_SERVER_PASSWORD=changeme
ENV TELEGRAM_BOT_TOKEN=""

EXPOSE 4096

# Runs the OpenCode HTTP/web server and the bot relay side by side
CMD ["sh", "-c", "opencode web --hostname 0.0.0.0 --port ${PORT:-4096} & node /app/bot.js"]
