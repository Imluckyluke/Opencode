FROM node:22-slim

# Install OpenCode CLI
RUN npm install -g opencode-ai

# Install the community Telegram bot client for OpenCode
RUN npm install -g @grinev/opencode-telegram-bot

# Preconfigure default model (Zen anonymous free lane — no API key/login needed)
RUN mkdir -p /root/.config/opencode
COPY opencode.json /root/.config/opencode/opencode.json

WORKDIR /workspace

# Set real values for these in Railway's Variables tab
ENV OPENCODE_SERVER_PASSWORD=changeme
ENV TELEGRAM_BOT_TOKEN=""
ENV TELEGRAM_ALLOWED_USER_ID=""
ENV OPENCODE_MODEL_PROVIDER=opencode
ENV OPENCODE_MODEL_ID=muse-spark-1.3-contributor-free

EXPOSE 4096

# Runs the OpenCode web/API server and the Telegram bot client side by side,
# pointing the bot at the same port OpenCode just bound to.
CMD ["sh", "-c", "opencode web --hostname 0.0.0.0 --port ${PORT:-4096} & OPENCODE_API_URL=http://localhost:${PORT:-4096} opencode-telegram start"]
